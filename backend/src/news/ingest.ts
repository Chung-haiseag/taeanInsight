// 태안신문(taeannews.co.kr) RSS 수집 — 자사 매체 신디케이션 피드 사용.
// 저작권 안전: 발췌(excerpt) + 원문 링크만 노출, 전문 복제 안 함. 서버측 10분 캐시.
// 수집한 기사를 플랫폼 도메인(관광·환경·부동산·정책·수산·문화)으로 자동 분류한다.
// TaskMaster #10(아카이브 스크래퍼) / #11(수집 파이프라인)

const RSS_URL = "https://www.taeannews.co.kr/rss/allArticle.xml";
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

// ── 캐시된 수집 ─────────────────────────────────────────────
let cache: { at: number; items: NewsItem[] } | null = null;

export async function getNews(force = false): Promise<NewsItem[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.items;
  const res = await fetch(RSS_URL, { headers: { "User-Agent": UA, Accept: "application/rss+xml, text/xml" } });
  if (!res.ok) {
    if (cache) return cache.items; // 실패 시 직전 캐시 유지
    throw new Error(`RSS fetch failed: ${res.status}`);
  }
  const xml = await res.text();
  const items = parseRss(xml);
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
  const items = await getNews(true);
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
    try {
      const html = await (await fetch(it.url, { headers: { "User-Agent": UA } })).text();
      const og = /property="og:image"\s+content="([^"]+)"/.exec(html)?.[1];
      if (og && !og.includes("/logo/")) {
        leadImage = og.replace("/thumbnail/", "/photo/").replace(/_v\d+(?=\.\w+$)/, "");
      }
    } catch { /* 사진 없이 진행 */ }
    const r = await db
      .prepare(
        `INSERT OR IGNORE INTO archive_articles
         (idxno, title, published_at, year, section, category, author, excerpt, body, images, lead_image, members_only, url)
         VALUES (?, ?, ?, ?, 'RSS', ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .bind(
        idxno, it.title, publishedAt, Number(it.publishedAt.slice(0, 4)),
        it.category, it.author ?? null, it.excerpt, it.excerpt,
        leadImage ? JSON.stringify([leadImage]) : "[]", leadImage, it.url,
      )
      .run();
    if (r.meta.changes) inserted++;
  }
  return { fetched: items.length, inserted };
}
