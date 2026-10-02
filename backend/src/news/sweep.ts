// 기사번호 순차 수집 — RSS·기사목록이 못 보는 기사를 번호로 직접 두드려 가져온다.
//
// 왜: 2026-09-14 점검에서 6-12 이후 신문 기사의 **절반**이 아카이브에 없었다(770칸 중 285건 보유,
//   빠진 40칸 표본 중 26칸이 실제 기사 → 약 315건 누락). 신문 RSS는 고장(최신 9-04, 50건이 3~9월에
//   흩어짐)이고 기사목록은 첫 25건만 준다(2페이지부터 비로그인 불가). 신문이 금요일 16시에 60~70건을
//   한꺼번에 올리니 목록 25건 밖은 수집기가 볼 기회가 없었다.
// 어떻게: idxno는 순차 발급이다. 없는 번호는 73바이트 alert 페이지(`존재하지 않는 링크`)라 두드리는
//   비용이 거의 없다. 매 실행마다
//   ① 앞: frontier(보유 최대 번호)+1부터 ahead칸 — 연속 miss가 STOP_AFTER면 멈춤(그 뒤는 아직 없는 번호)
//   ② 뒤: frontier-behind..frontier의 빈 칸 전부 — 초안은 번호를 먼저 받고 다음 주 금요일에 발행되기도
//      하므로, 한 번 없었던 칸도 frontier 뒤 150칸 안에서는 계속 다시 본다
//   ③ 백필: back 커서에서 바닥(68301, 자동 수집 첫 기사)까지 빈 칸을 예산만큼 — 커서는 kv_cache에
//      남겨 이어서 한다(체크포인트). 끝나면 done, 이후엔 ①②만 돈다.
//   기존 RSS+목록 수집(ingestToArchive)은 그대로 둔다 — 최신 25건은 그쪽이 먼저 넣고, 여기는 빈 칸을 메운다.
// 규칙: 제목·발행시각이 없으면 넣지 않는다(반쪽 행 금지). 회원전용인데 본문을 못 받았으면 넣지 않고
//   다음 실행에 다시 본다(로그인이 잠깐 실패한 것일 수 있다). 한 건 실패가 실행을 죽이지 않는다.
import type { NewsCategory } from "./ingest";
import { BROWSER_UA, classifyNews, decodeEntities, extractArticle, loginTaean, pickImages, stripHtml } from "./ingest";

export const SWEEP_KEY = "article_sweep";
/** 자동 수집(section='RSS')의 첫 기사 — 이보다 작은 번호는 백필본이 있다. */
export const SWEEP_FLOOR_IDXNO = 68301;
const ARTICLE_URL = "https://www.taeannews.co.kr/news/articleView.html?idxno=";
const STOP_AFTER = 25; // 앞쪽 연속 miss 허용 — 발행 구간의 빈 칸 밀도는 ~18%라 25연속은 사실상 '그 뒤는 없다'

export interface ArticleMeta {
  title: string;
  publishedAt: string; // ISO +09:00 (신문 메타 그대로)
  section: string | null; // '뉴스>문화' (백필 관례: 대>소)
  author: string | null;
  excerpt: string;
  gated: boolean;
}

/** 없는 번호 = alert 페이지. 빈 응답·og:title 없는 응답도 '없음'으로 읽는다 — 있다고 넣는 것보다 낫다. */
export function isNotFoundPage(html: string): boolean {
  if (!html || html.length < 200) return true;
  if (/존재하지 않는 링크|history\.back\(\)/.test(html.slice(0, 400))) return true;
  return !/property="og:title"\s+content="[^"]+"/.test(html);
}

function meta(html: string, attr: "property" | "name", key: string): string | null {
  const m = new RegExp(`<meta\\s+${attr}="${key.replace(/[.:]/g, "\\$&")}"\\s+content="([^"]*)"`).exec(html);
  return m ? m[1] : null;
}

export function parseArticleMeta(html: string): ArticleMeta | null {
  const rawTitle = meta(html, "property", "og:title");
  const publishedAt = meta(html, "property", "article:published_time");
  if (!rawTitle || !publishedAt) return null;
  const title = decodeEntities(stripHtml(rawTitle)).trim();
  if (!title) return null;
  // 섹션은 백필본 관례(대>소)와 **같은 글자**로 — 백필본은 메타의 '농&#12539;어업'을 그대로 뒀으므로 여기서도
  // &amp;만 풀고 숫자 엔티티는 남긴다(한 번 더 풀면 '농·어업'이 되어 같은 섹션이 두 갈래로 갈린다).
  const sec = (v: string | null) => (v ? v.replace(/&amp;/g, "&").trim() || null : null);
  const big = sec(meta(html, "property", "article:section"));
  const small = sec(meta(html, "property", "article:section1"));
  const section = big ? (small ? `${big}>${small}` : big) : null;
  const authorRaw = meta(html, "name", "author") ?? meta(html, "property", "dable:author");
  const author = authorRaw ? decodeEntities(stripHtml(authorRaw)).trim() || null : null;
  const excerpt = decodeEntities(stripHtml(meta(html, "property", "og:description") ?? ""));
  const gated = /회원전용기사|회원만 열람|로그인 또는 회원가입/.test(html);
  return { title, publishedAt, section, author, excerpt, gated };
}

export interface SweepPlan { forward: number[]; behind: number[]; backfill: number[] }

export function planSweep(opts: {
  existing: Set<number>;
  frontier: number;
  floor: number;
  back: number;
  backDone?: boolean;
  ahead?: number;
  behind?: number;
  backBudget?: number;
}): SweepPlan {
  const ahead = opts.ahead ?? 40;
  const behindN = opts.behind ?? 150;
  const budget = opts.backBudget ?? 60;
  const forward: number[] = [];
  for (let i = opts.frontier + 1; i <= opts.frontier + ahead; i++) if (!opts.existing.has(i)) forward.push(i);
  const behindLo = Math.max(opts.floor, opts.frontier - behindN);
  const behind: number[] = [];
  for (let i = opts.frontier; i >= behindLo; i--) if (!opts.existing.has(i)) behind.push(i);
  const backfill: number[] = [];
  if (!opts.backDone) {
    // 뒤 창과 겹치지 않게 — 창 아래부터
    for (let i = Math.min(opts.back, behindLo - 1); i >= opts.floor && backfill.length < budget; i--) {
      if (!opts.existing.has(i)) backfill.push(i);
    }
  }
  return { forward, behind, backfill };
}

export function nextBackCursor(probed: number[], floor: number): { back: number; done: boolean } {
  if (!probed.length) return { back: floor - 1, done: true };
  const back = Math.min(...probed) - 1;
  return { back, done: back < floor };
}

export interface SweepCursor { back: number; done?: boolean; probed?: number; found?: number; at?: string }

export interface SweepResult {
  frontier: number;
  probed: number;
  found: number; // 실제 기사(있음)
  inserted: number;
  skipped: number; // 있는데 못 넣음(게이트+본문 실패·메타 부족)
  failed: number; // 네트워크 등 예외
  back: number;
  backDone: boolean;
  items: Array<{ idxno: number; title: string; publishedAt: string; gated: boolean }>;
}

async function getHtml(idxno: number, cookie?: string): Promise<string> {
  const headers: Record<string, string> = { "User-Agent": BROWSER_UA, Referer: "https://www.taeannews.co.kr/" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${ARTICLE_URL}${idxno}`, { headers });
  return res.text();
}

/**
 * 한 실행. 앞 → 뒤 → 백필 순. 넣은 건수 상한(maxInsert)과 두드림 상한(maxProbe)으로 Worker 시간을 지킨다.
 * @param opts.back 커서 강제(관리자용) — 예: 빠진 구간을 다시 훑고 싶을 때.
 */
export async function sweepMissingArticles(
  env: { ARCHIVE_DB?: D1Database; TAEAN_ID?: string; TAEAN_PW?: string },
  opts: { back?: number; backBudget?: number; maxInsert?: number; maxProbe?: number; ahead?: number; behind?: number; floor?: number } = {},
): Promise<SweepResult> {
  const db = env.ARCHIVE_DB;
  const floor = opts.floor ?? SWEEP_FLOOR_IDXNO;
  const out: SweepResult = { frontier: 0, probed: 0, found: 0, inserted: 0, skipped: 0, failed: 0, back: floor - 1, backDone: true, items: [] };
  if (!db) return out;

  const fr = await db.prepare("SELECT MAX(idxno) m FROM archive_articles WHERE idxno<90000000").first<{ m: number | null }>();
  const frontier = fr?.m ?? floor;
  out.frontier = frontier;

  const row = await db.prepare("SELECT v FROM kv_cache WHERE k=?").bind(SWEEP_KEY).first<{ v: string }>();
  let cur: SweepCursor = { back: frontier };
  if (row?.v) { try { cur = JSON.parse(row.v) as SweepCursor; } catch { /* 처음부터 */ } }
  if (opts.back !== undefined) cur = { ...cur, back: opts.back, done: false };

  const behindN = opts.behind ?? 150;
  // 보유 번호 집합 — 계획이 보는 구간을 넉넉히 덮는다(백필 커서 아래 2,000칸 ≈ 9개월). 집합 밖은 '없음'으로
  // 취급되므로 좁게 잡으면 이미 있는 기사를 헛되이 두드린다.
  const lo = Math.max(floor, Math.min(frontier - behindN, cur.done ? frontier : cur.back) - 2000);
  const ex = await db
    .prepare("SELECT idxno FROM archive_articles WHERE idxno BETWEEN ? AND ?")
    .bind(lo, frontier + (opts.ahead ?? 40))
    .all<{ idxno: number }>();
  const existing = new Set((ex.results ?? []).map((r) => r.idxno));

  const plan = planSweep({ existing, frontier, floor, back: cur.back, backDone: cur.done, ahead: opts.ahead, behind: behindN, backBudget: opts.backBudget });
  const maxInsert = opts.maxInsert ?? 60;
  const maxProbe = opts.maxProbe ?? 250;

  let cookie = "";
  if (env.TAEAN_ID && env.TAEAN_PW) {
    try { cookie = await loginTaean(env.TAEAN_ID, env.TAEAN_PW); } catch { /* 익명으로만 — 게이트 기사는 다음에 */ }
  }

  const probedBackfill: number[] = [];
  let stop = false;
  const probe = async (idxno: number, phase: "forward" | "behind" | "backfill"): Promise<"found" | "miss" | "error"> => {
    if (out.probed >= maxProbe || out.inserted >= maxInsert) { stop = true; return "miss"; }
    out.probed++;
    if (phase === "backfill") probedBackfill.push(idxno);
    try {
      const html = await getHtml(idxno);
      if (isNotFoundPage(html)) return "miss";
      out.found++;
      const m = parseArticleMeta(html);
      if (!m) { out.skipped++; return "found"; }
      let art = extractArticle(html);
      if (!art.body && m.gated && cookie) art = extractArticle(await getHtml(idxno, cookie));
      if (!art.body && m.gated) { out.skipped++; return "found"; } // 로그인 실패 — 다음 실행에 다시
      const og = meta(html, "property", "og:image");
      const ogFull = og && !og.includes("/logo/") ? og.replace("/thumbnail/", "/photo/").replace(/_v\d+(?=\.\w+$)/, "") : null;
      const images = pickImages(art.images, ogFull);
      const body = art.body || m.excerpt;
      const excerpt = body.length > 140 ? body.slice(0, 140) + "…" : body;
      const category: NewsCategory = classifyNews(`${m.title} ${body.slice(0, 600)}`);
      const r = await db
        .prepare(
          `INSERT OR IGNORE INTO archive_articles
           (idxno, title, published_at, year, section, category, author, excerpt, body, images, lead_image, members_only, url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(idxno, m.title, m.publishedAt, Number(m.publishedAt.slice(0, 4)), m.section ?? "RSS", category, m.author, excerpt, body,
          JSON.stringify(images), images[0] ?? null, m.gated ? 1 : 0, `${ARTICLE_URL}${idxno}`)
        .run();
      if (r.meta.changes) {
        out.inserted++;
        out.items.push({ idxno, title: m.title, publishedAt: m.publishedAt, gated: m.gated });
      }
      return "found";
    } catch (e) {
      out.failed++;
      console.warn(`[sweep] ${idxno} 실패: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
      return "error";
    }
  };

  // ① 앞 — 연속 miss STOP_AFTER면 그 뒤는 아직 없는 번호
  let misses = 0;
  for (const i of plan.forward) {
    if (stop) break;
    const r = await probe(i, "forward");
    misses = r === "miss" ? misses + 1 : 0;
    if (misses >= STOP_AFTER) break;
  }
  // ② 뒤 창 — 빈 칸 전부(초안이 늦게 발행되는 경우)
  for (const i of plan.behind) { if (stop) break; await probe(i, "behind"); }
  // ③ 백필 — 예산만큼, 커서 저장
  for (const i of plan.backfill) { if (stop) break; await probe(i, "backfill"); }

  let back = cur.back;
  let backDone = !!cur.done;
  if (!cur.done) {
    if (plan.backfill.length === 0) { backDone = true; back = floor - 1; }
    else if (probedBackfill.length) {
      const n = nextBackCursor(probedBackfill, floor);
      back = n.back;
      backDone = n.done;
    }
  }
  out.back = back;
  out.backDone = backDone;
  const next: SweepCursor = {
    back, done: backDone,
    probed: (cur.probed ?? 0) + out.probed,
    found: (cur.found ?? 0) + out.inserted,
    at: new Date().toISOString(),
  };
  await db
    .prepare("INSERT INTO kv_cache(k, v, ts) VALUES(?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, ts=excluded.ts")
    .bind(SWEEP_KEY, JSON.stringify(next), Date.now())
    .run();
  return out;
}
