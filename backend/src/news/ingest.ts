// 태안신문(taeannews.co.kr) RSS 수집 — 자사 매체 신디케이션 피드 사용.
// 저작권 안전: 발췌(excerpt) + 원문 링크만 노출, 전문 복제 안 함. 서버측 10분 캐시.
// 수집한 기사를 플랫폼 도메인(관광·환경·부동산·정책·수산·문화)으로 자동 분류한다.
// TaskMaster #10(아카이브 스크래퍼) / #11(수집 파이프라인)

const RSS_URL = "https://www.taeannews.co.kr/rss/allArticle.xml";
// 기사목록(전 섹션 최신) — RSS 피드가 소스 쪽에서 정체될 때 최신 기사를 보강 수집
const LIST_URL = "https://www.taeannews.co.kr/news/articleList.html?view_type=sm";
const ARTICLE_BASE = "https://www.taeannews.co.kr/news/articleView.html?idxno=";
const TTL_MS = 10 * 60 * 1000;
const UA = "TaeanInsightBot/0.1 (+https://insight.taeannews.co.kr; 자사 RSS 수집)";

export type NewsCategory =
  | "tourism"
  | "environment"
  | "realestate"
  | "policy"
  | "industry"
  | "culture"
  | "society";

export interface NewsItem {
  id: string; // idxno
  title: string;
  url: string;
  excerpt: string;
  author?: string;
  publishedAt: string; // "YYYY-MM-DD HH:mm:ss"
  category: NewsCategory;
}

// ── 자동 분류 (우선순위 순) ─────────────────────────────────
// 휴리스틱 분류 — 추후 하이브리드 LLM 분류기로 대체 예정. 순서가 곧 우선순위.
const CATEGORY_KEYWORDS: [NewsCategory, string[]][] = [
  ["tourism", ["관광", "해수욕장", "축제", "펜션", "여행", "방문객", "꽃지", "만리포", "안면도", "특산", "먹거리", "해변"]],
  ["industry", ["수산", "어선", "어업", "양식", "농업", "농협", "마늘", "산업", "기업", "일자리", "어민", "수확", "해삼", "굴", "구명조끼"]],
  ["environment", ["환경", "적조", "갯벌", "해양", "기상", "미세먼지", "생태", "가로림만", "오염", "탄소", "신재생", "바다", "기후"]],
  ["policy", ["군수", "군의회", "선거", "행정", "조례", "예산", "군정", "정책", "민원", "의회", "공무원", "당선", "교육감", "후보"]],
  ["realestate", ["부동산", "토지", "분양", "아파트", "개발", "도시계획", "택지", "건축", "재개발"]],
  ["culture", ["문화", "예술", "공연", "전시", "교육", "학생", "도서관", "체육", "수영", "장학", "공모전"]],
];

export function classifyNews(text: string): NewsCategory {
  for (const [cat, kws] of CATEGORY_KEYWORDS) {
    if (kws.some((k) => text.includes(k))) return cat;
  }
  return "society";
}

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  tourism: "관광",
  environment: "환경",
  realestate: "부동산",
  policy: "정책·행정",
  industry: "수산·산업",
  culture: "문화·교육",
  society: "지역사회",
};

// ── RSS 파싱 ────────────────────────────────────────────────
function unwrapCdata(s: string): string {
  return s.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim();
}

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? unwrapCdata(m[1]) : "";
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRss(xml: string): NewsItem[] {
  const blocks = xml.split("<item>").slice(1);
  const items: NewsItem[] = [];
  for (const raw of blocks) {
    const block = raw.split("</item>")[0];
    const title = stripHtml(extractTag(block, "title"));
    const url = extractTag(block, "link");
    if (!title || !url) continue;
    const idMatch = url.match(/idxno=(\d+)/);
    const id = idMatch ? idMatch[1] : url;
    const excerptFull = stripHtml(extractTag(block, "description"));
    const excerpt = excerptFull.length > 140 ? excerptFull.slice(0, 140) + "…" : excerptFull;
    const author = stripHtml(extractTag(block, "author")) || undefined;
    const publishedAt = extractTag(block, "pubDate");
    items.push({
      id,
      title,
      url,
      excerpt,
      author,
      publishedAt,
      category: classifyNews(`${title} ${excerptFull}`),
    });
  }
  return items;
}

// ── 기사목록 HTML 파싱 (RSS 정체 시 최신 보강) ───────────────
// articleList.html에서 idxno·제목·발행시각·기자 추출. 발췌는 없으므로 적재 시 og:description으로 채움.
function parseArticleList(html: string): NewsItem[] {
  const re =
    /articleView\.html\?idxno=(\d+)"[^>]*>([^<]+)<\/a>\s*<\/H2>\s*<em class="info dated">([^<]+)<\/em>(?:\s*<em class="info name">([^<]+)<\/em>)?/g;
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const title = stripHtml(m[2]);
    if (!title) continue;
    // "2026-06-12 16:00" → "2026-06-12 16:00:00"
    const dt = m[3].trim();
    const publishedAt = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dt) ? `${dt}:00` : dt;
    const author = m[4] ? stripHtml(m[4]) : undefined;
    items.push({ id, title, url: `${ARTICLE_BASE}${id}`, excerpt: "", author, publishedAt, category: classifyNews(title) });
  }
  return items;
}

async function getListNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch(LIST_URL, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    return parseArticleList(await res.text());
  } catch {
    return [];
  }
}

// ── 캐시된 수집 ─────────────────────────────────────────────
let cache: { at: number; items: NewsItem[] } | null = null;

export async function getNews(force = false): Promise<NewsItem[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.items;
  // RSS + 기사목록 병합 — RSS가 정체돼도 목록의 최신 기사를 피드에 반영
  let rss: NewsItem[] = [];
  try {
    const res = await fetch(RSS_URL, { headers: { "User-Agent": UA, Accept: "application/rss+xml, text/xml" } });
    if (res.ok) rss = parseRss(await res.text());
  } catch { /* 목록으로 폴백 */ }
  const list = await getListNews();
  const byId = new Map<string, NewsItem>();
  for (const it of rss) byId.set(it.id, it);                 // RSS 우선(발췌 포함)
  for (const it of list) if (!byId.has(it.id)) byId.set(it.id, it);
  const items = [...byId.values()];
  if (!items.length) {
    if (cache) return cache.items; // 둘 다 실패 시 직전 캐시 유지
    throw new Error("news fetch failed (RSS + list)");
  }
  items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0)); // 최신순
  cache = { at: Date.now(), items };
  return items;
}

export function categoryCounts(items: NewsItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const it of items) counts[it.category] = (counts[it.category] ?? 0) + 1;
  return counts;
}

// ── RSS → D1 아카이브 자동 적재 (cron) ─────────────────────────────────────
// 새 기사를 archive_articles에 영구 보존 — RSS(최근 50건)가 흘러가도 검색·관련뉴스에 남는다.
// idxno = taeannews 원본 기사번호 → 백필 데이터와 같은 키스페이스로 자연 통합(중복은 IGNORE).
// 저작권: RSS 발췌만 저장(전문 없음), 원문 링크 보존.
export async function ingestToArchive(env: { ARCHIVE_DB?: D1Database }): Promise<{ fetched: number; inserted: number }> {
  const db = env.ARCHIVE_DB;
  if (!db) return { fetched: 0, inserted: 0 };
  // getNews가 RSS + 기사목록을 병합 제공 (RSS 정체 시에도 최신 포함)
  const items = await getNews(true).catch(() => [] as NewsItem[]);
  let inserted = 0;
  for (const it of items) {
    const idxno = Number(it.id);
    if (!Number.isFinite(idxno) || idxno <= 0) continue;
    // 이미 있으면 페이지 fetch 생략(비용·트래픽 절약)
    const exists = await db.prepare("SELECT 1 FROM archive_articles WHERE idxno=?").bind(idxno).first();
    if (exists) continue;
    const publishedAt = it.publishedAt.replace(" ", "T") + "+09:00";
    // 대표사진: 기사 페이지의 og:image 썸네일(_v150) → 원본 photo URL 유도. 로고면 제외 (백필과 동일 규칙)
    let leadImage: string | null = null;
    let excerpt = it.excerpt;
    try {
      const html = await (await fetch(it.url, { headers: { "User-Agent": UA } })).text();
      const og = /property="og:image"\s+content="([^"]+)"/.exec(html)?.[1];
      if (og && !og.includes("/logo/")) {
        leadImage = og.replace("/thumbnail/", "/photo/").replace(/_v\d+(?=\.\w+$)/, "");
      }
      // 목록 출처 기사는 발췌가 없으므로 og:description으로 채움
      if (!excerpt) {
        const desc = /property="og:description"\s+content="([^"]*)"/.exec(html)?.[1];
        if (desc) { const d = stripHtml(desc); excerpt = d.length > 140 ? d.slice(0, 140) + "…" : d; }
      }
    } catch { /* 사진/발췌 없이 진행 */ }
    const r = await db
      .prepare(
        `INSERT OR IGNORE INTO archive_articles
         (idxno, title, published_at, year, section, category, author, excerpt, body, images, lead_image, members_only, url)
         VALUES (?, ?, ?, ?, 'RSS', ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .bind(
        idxno, it.title, publishedAt, Number(it.publishedAt.slice(0, 4)),
        it.category, it.author ?? null, excerpt, excerpt,
        leadImage ? JSON.stringify([leadImage]) : "[]", leadImage, it.url,
      )
      .run();
    if (r.meta.changes) inserted++;
  }
  return { fetched: items.length, inserted };
}
