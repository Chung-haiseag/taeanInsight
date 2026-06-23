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

// ── D1 캐시(stale-while-revalidate) — workers.dev는 엣지캐시 불가, 콜드 isolate 매번 느림 대응 ──
const NEWS_CACHE_TTL_MS = 15 * 60 * 1000;

export async function readNewsCache(db: D1Database): Promise<{ items: NewsItem[]; ageMs: number } | null> {
  try {
    const r = await db.prepare("SELECT items, updated_at FROM news_cache WHERE id=1").first<{ items: string; updated_at: string }>();
    if (!r) return null;
    return { items: JSON.parse(r.items) as NewsItem[], ageMs: Date.now() - Date.parse(r.updated_at) };
  } catch { return null; }
}

export async function writeNewsCache(db: D1Database, items: NewsItem[]): Promise<void> {
  try {
    await db.prepare("INSERT INTO news_cache (id, items, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET items=excluded.items, updated_at=excluded.updated_at")
      .bind(JSON.stringify(items), new Date().toISOString()).run();
  } catch { /* 캐시 실패는 무시 */ }
}

// 캐시 우선 — 있으면 즉시 반환(오래되면 호출측에서 백그라운드 갱신), 없으면 라이브 수집.
export async function getNewsFast(db: D1Database | undefined): Promise<{ items: NewsItem[]; stale: boolean }> {
  if (db) {
    const cached = await readNewsCache(db);
    if (cached && cached.items.length) return { items: cached.items, stale: cached.ageMs > NEWS_CACHE_TTL_MS };
  }
  const items = await getNews();          // 콜드(캐시 없음) — 라이브 수집
  if (db) await writeNewsCache(db, items);
  return { items, stale: false };
}

export function categoryCounts(items: NewsItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const it of items) counts[it.category] = (counts[it.category] ?? 0) + 1;
  return counts;
}

// ── 회원 로그인 + 전문 추출 (taeannews는 본문을 회원 게이트 뒤에 둠) ──────────
// 세션 바인딩 때문에 실제 브라우저 UA 사용. 비밀번호는 시크릿으로만 받고 로그/저장 안 함.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const LOGIN_URL = "https://www.taeannews.co.kr/member/login.php";

async function login(id: string, pw: string): Promise<string> {
  const form = new URLSearchParams({ user_id: id, user_pw: pw, backUrl: "", id_save: "N" });
  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: { "User-Agent": BROWSER_UA, "Content-Type": "application/x-www-form-urlencoded", Referer: LOGIN_URL },
    body: form,
    redirect: "manual",
  });
  const setCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&middot;/g, "·").replace(/&hellip;/g, "…").replace(/&ldquo;|&rdquo;/g, '"').replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// 기사 페이지 HTML에서 전문 추출 (백필과 동일 규칙). 게이트(회원전용 안내)면 "" 반환.
function extractFullBody(html: string): string {
  const anchor = html.indexOf('id="article-view-content-div"');
  if (anchor === -1) return "";
  const gt = html.indexOf(">", anchor);
  let chunk = html.slice(gt + 1, gt + 1 + 60000);
  // 본문 끝(저작권 푸터/공유버튼)에서 자른다. <script는 제외 — 본문 앞 인라인 스크립트(광고)에
  // 잘려 본문이 비는 경우 방지. 스크립트 블록은 아래 bodyText가 통째로 제거.
  const cut = chunk.search(/저작권자|무단전재|id="dn_btn"|이 기사를 공유/);
  if (cut !== -1) chunk = chunk.slice(0, cut);
  const text = decodeEntities(
    chunk
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (/회원전용기사|회원만 열람|로그인 또는 회원가입/.test(text)) return ""; // 비로그인 게이트
  return text;
}

// ── RSS → D1 아카이브 자동 적재 (cron) ─────────────────────────────────────
// 새 기사를 archive_articles에 영구 보존 — RSS(최근 50건)가 흘러가도 검색·관련뉴스에 남는다.
// idxno = taeannews 원본 기사번호 → 백필 데이터와 같은 키스페이스로 자연 통합(중복은 IGNORE).
// 저작권: 자사(태안신문) 콘텐츠. 회원 로그인 시 전문 저장, 없으면 발췌 + 원문 링크.
export async function ingestToArchive(
  env: { ARCHIVE_DB?: D1Database; TAEAN_ID?: string; TAEAN_PW?: string },
): Promise<{ fetched: number; inserted: number; upgraded: number; loggedIn: boolean }> {
  const db = env.ARCHIVE_DB;
  if (!db) return { fetched: 0, inserted: 0, upgraded: 0, loggedIn: false };
  // 회원 로그인(전문 수집용) — 자격증명 있을 때만. 실패해도 발췌로 폴백.
  let cookie = "";
  if (env.TAEAN_ID && env.TAEAN_PW) {
    try { cookie = await login(env.TAEAN_ID, env.TAEAN_PW); } catch { /* 발췌 폴백 */ }
  }
  // getNews가 RSS + 기사목록을 병합 제공 (RSS 정체 시에도 최신 포함)
  const items = await getNews(true).catch(() => [] as NewsItem[]);
  let inserted = 0, upgraded = 0;
  for (const it of items) {
    const idxno = Number(it.id);
    if (!Number.isFinite(idxno) || idxno <= 0) continue;
    // 기존 행 상태 — 전문 이미 있으면 스킵. RSS 스텁(발췌만)인데 로그인됐으면 전문으로 업그레이드.
    const existing = await db
      .prepare("SELECT section, length(body) AS blen FROM archive_articles WHERE idxno=?")
      .bind(idxno)
      .first<{ section: string | null; blen: number | null }>();
    const isStub = !!existing && existing.section === "RSS" && (existing.blen ?? 0) < 300;
    if (existing && !(isStub && cookie)) continue;

    const publishedAt = it.publishedAt.replace(" ", "T") + "+09:00";
    const baseHdr = { "User-Agent": BROWSER_UA, Referer: "https://www.taeannews.co.kr/" };
    let leadImage: string | null = null;
    let body = "";
    let excerpt = it.excerpt;
    try {
      // 익명으로 먼저 — 공개 기사는 그대로 전문 추출(로그인 세션이 일부 공개 기사를 깨뜨림)
      const html = await (await fetch(it.url, { headers: baseHdr })).text();
      const og = /property="og:image"\s+content="([^"]+)"/.exec(html)?.[1];
      if (og && !og.includes("/logo/")) leadImage = og.replace("/thumbnail/", "/photo/").replace(/_v\d+(?=\.\w+$)/, "");
      if (!excerpt) {
        const desc = /property="og:description"\s+content="([^"]*)"/.exec(html)?.[1];
        if (desc) excerpt = stripHtml(desc);
      }
      body = extractFullBody(html);
      // 익명이 회원전용 게이트면 로그인 쿠키로 재시도
      if (!body && cookie) {
        const html2 = await (await fetch(it.url, { headers: { ...baseHdr, Cookie: cookie } })).text();
        body = extractFullBody(html2);
      }
    } catch { /* 사진/본문 없이 진행 */ }
    // 발췌: 전문 있으면 전문 앞부분, 없으면 메타 설명
    const excSource = body || excerpt;
    excerpt = excSource.length > 140 ? excSource.slice(0, 140) + "…" : excSource;
    const storeBody = body || excerpt; // 전문 없으면 발췌를 본문으로(폴백)

    if (existing && isStub) {
      const r = await db
        .prepare("UPDATE archive_articles SET body=?, excerpt=?, lead_image=COALESCE(?,lead_image), images=? WHERE idxno=?")
        .bind(storeBody, excerpt, leadImage, leadImage ? JSON.stringify([leadImage]) : "[]", idxno)
        .run();
      if (r.meta.changes && body) upgraded++;
    } else {
      const r = await db
        .prepare(
          `INSERT OR IGNORE INTO archive_articles
           (idxno, title, published_at, year, section, category, author, excerpt, body, images, lead_image, members_only, url)
           VALUES (?, ?, ?, ?, 'RSS', ?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .bind(
          idxno, it.title, publishedAt, Number(it.publishedAt.slice(0, 4)),
          it.category, it.author ?? null, excerpt, storeBody,
          leadImage ? JSON.stringify([leadImage]) : "[]", leadImage, it.url,
        )
        .run();
      if (r.meta.changes) inserted++;
    }
  }
  return { fetched: items.length, inserted, upgraded, loggedIn: !!cookie };
}
