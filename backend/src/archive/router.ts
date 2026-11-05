// 태안신문 아카이브 API — D1(텍스트·검색) + R2(사진).
// 백필(tools/backfill) → D1 적재 + R2 업로드 후 동작. 데이터 없으면 빈 결과 반환.
//   GET /api/archive/search?q=&category=&year=&page=  전문 검색(FTS5, LIKE 폴백)
//   GET /api/archive/:idxno                            기사 1건(전문 — 회원 게이트는 프론트)
//   GET /api/archive/photo/:key                        R2 사진 서빙(공개)

import { Hono } from "hono";
import { EBOOK_MIN, EBOOK_MAX, groupIssues, type IssueRow } from "./paper";
import { adKind } from "./ad_filter";
import { PRICE_LABELS } from "./ad_prices";

import type { Env } from "../types";
import { FTS_MIN, relatedKeywords, titleMatchQuery } from "./related";
import { cacheRule } from "../lib/cache_headers";

export const archiveRouter = new Hono<{ Bindings: Env }>();

const PAGE_SIZE = 20;

// stats 카테고리 집계 — GROUP BY 결과 행을 { category: count } 맵으로.
/**
 * 연도별 기사 수를 minYear~maxYear 빈 해까지 채워 돌려준다(뉴스아카이브 머리칸 막대).
 * ⚠ 없는 해를 건너뛰면 가로축이 '값 있는 해'만 늘어서 36년이라는 폭 자체가 거짓이 된다.
 */
export function toYearCounts(
  rows: { year: number; n: number }[],
  minYear: number | null,
  maxYear: number | null,
): Array<{ year: number; n: number }> {
  if (minYear == null || maxYear == null || maxYear < minYear || !rows.length) return [];
  const got = new Map(rows.map((r) => [Number(r.year), Number(r.n)]));
  const out: Array<{ year: number; n: number }> = [];
  for (let y = minYear; y <= maxYear; y++) out.push({ year: y, n: got.get(y) ?? 0 });
  return out;
}

export function toCategoryCounts(rows: { category: string; n: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) if (r.category) out[r.category] = r.n;
  return out;
}

// 검색 — FTS5 우선, 미지원/오류 시 LIKE 폴백
archiveRouter.get("/search", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ items: [], total: 0, note: "archive_db_unbound" });
  const adb: D1Database = db; // 클로저에서 narrowing 유지

  const q = (c.req.query("q") ?? "").trim();
  const category = c.req.query("category");
  const year = c.req.query("year");
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const offset = (page - 1) * PAGE_SIZE;

  const filters: string[] = [];
  const binds: unknown[] = [];
  // 지면 광고는 검색에서 뺀다 — 30년 전 월세·구인 광고가 결과의 3분의 1을 차지했다.
  //   지운 게 아니라 표시만 단 것이라, 주소를 직접 열면 기사 화면은 그대로 나온다.
  filters.push("COALESCE(a.is_ad,0) = 0");
  if (category) {
    filters.push("a.category = ?");
    binds.push(category);
  }
  if (year) {
    filters.push("a.year = ?");
    binds.push(Number(year));
  }

  const cols = "idxno,title,published_at,year,section,category,author,excerpt,lead_image,members_only";

  // FTS5 트라이그램은 3글자 이상만 매칭 → 긴 질의는 FTS, 짧은 질의는 LIKE.
  // 항목 쿼리와 COUNT를 병렬 실행해 전체 건수·페이지수를 함께 반환(지연 최소화).
  async function ftsSearch() {
    const where = ["archive_fts MATCH ?", ...filters].join(" AND ");
    const base = `FROM archive_fts f JOIN archive_articles a ON a.idxno = f.rowid WHERE ${where}`;
    const sql = `SELECT ${cols.replace(/(\w+)/g, "a.$1")} ${base} ORDER BY a.published_at DESC LIMIT ? OFFSET ?`;
    const [rows, cnt] = await Promise.all([
      adb.prepare(sql).bind(q, ...binds, PAGE_SIZE, offset).all(),
      adb.prepare(`SELECT COUNT(*) AS n ${base}`).bind(q, ...binds).first<{ n: number }>(),
    ]);
    return { rows, total: cnt?.n ?? 0 };
  }
  // 짧은 질의(2글자) 폴백 — 본문 LIKE 풀스캔(~104k행, 2s+)을 피해 제목만 검색(제목은 짧아 COUNT도 빠름).
  async function likeSearch() {
    const where = ["a.title LIKE ?", ...filters].join(" AND ");
    const base = `FROM archive_articles a WHERE ${where}`;
    const sql = `SELECT ${cols} ${base} ORDER BY published_at DESC LIMIT ? OFFSET ?`;
    const [rows, cnt] = await Promise.all([
      adb.prepare(sql).bind(`%${q}%`, ...binds, PAGE_SIZE, offset).all(),
      adb.prepare(`SELECT COUNT(*) AS n ${base}`).bind(`%${q}%`, ...binds).first<{ n: number }>(),
    ]);
    return { rows, total: cnt?.n ?? 0 };
  }
  async function listOnly() {
    const where = filters.length ? "WHERE " + filters.join(" AND ") : "";
    const base = `FROM archive_articles a ${where}`;
    const sql = `SELECT ${cols} ${base} ORDER BY published_at DESC LIMIT ? OFFSET ?`;
    const [rows, cnt] = await Promise.all([
      adb.prepare(sql).bind(...binds, PAGE_SIZE, offset).all(),
      adb.prepare(`SELECT COUNT(*) AS n ${base}`).bind(...binds).first<{ n: number }>(),
    ]);
    return { rows, total: cnt?.n ?? 0 };
  }

  // 검색 목록 성능: 전자북 기사의 lead_image는 520KB 지면 스캔이라 20개면 ~10MB.
  // 80px 썸네일엔 과대 → 검색 목록에선 제거(상세 페이지의 원본 지면은 그대로). 백필/RSS 썸네일은 유지.
  const lite = (items: unknown[] = []) =>
    (items as Record<string, unknown>[]).map((it) => {
      const n = Number(it.idxno);
      return n >= 90000001 && n <= 90099999 ? { ...it, lead_image: null } : it;
    });

  const reply = (res: { rows: D1Result; total: number }, mode: string) => {
    const items = res.rows.results ?? [];
    return c.json({
      items: lite(items), page, pageSize: PAGE_SIZE, mode,
      total: res.total,
      totalPages: Math.max(1, Math.ceil(res.total / PAGE_SIZE)),
      hasMore: page * PAGE_SIZE < res.total,
    });
  };

  try {
    if (!q) return reply(await listOnly(), "list");
    if (q.length >= 3) {
      const r = await ftsSearch();
      if ((r.rows.results?.length ?? 0) > 0) return reply(r, "fts");
    }
    return reply(await likeSearch(), "like"); // 짧은 질의 또는 FTS 0건
  } catch (e) {
    return c.json({ error: "search_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// 관련 "과거" 기사 — 제목 키워드로 주제 매칭 + 현재 기사보다 이전(published_at <) 우선.
// 주제 매칭이 부족하면 같은 분류의 과거 기사로 폴백. 추후 임베딩 의미검색으로 업그레이드.
// (관련 뉴스 키워드 규칙은 ./related.ts 로 옮겼다 — 2026-10-17)

// "역대 오늘, 태안" — 정확히 오늘과 같은 일자(MM-DD)의 과거 주요 뉴스를 랜덤으로.
//   주요 신호: 옛 지면 01~03면(1면·종합), 현대 정치·자치행정, 또는 사진(lead_image) 보유.
//   같은 일자가 너무 적으면(주간지라 발행일 편차) ±3일로 자동 보강. 새로고침마다 셔플.
// 주요뉴스만: 옛 01~03면(1면·종합)·현대 뉴스/라이프 섹션 + 본문 500자↑(광고·단신 배제).
const ON_THIS_DAY_MAJOR = `(
  (section LIKE '%01면%' OR section LIKE '%02면%' OR section LIKE '%03면%'
   OR section LIKE '뉴스>%' OR section LIKE '라이프>%')
  AND body IS NOT NULL AND LENGTH(body) >= 500
  AND title NOT LIKE '%급전%' AND title NOT LIKE '%대출%' AND title NOT LIKE '%무제한%' AND title NOT LIKE '%■%'
  AND title NOT LIKE '%광고%'
  AND title NOT GLOB '[0-9][0-9][0-9][0-9]*면'   -- 'YYYY... NN면' 제목 누락 아티팩트 제외
)`;

/**
 * 아카이브 전체 통계 — 총 건수·연도 범위·카테고리별 건수.
 *
 *   ⚠ **반드시 캐시해서 낸다.** 이 두 질의는 표 전체를 훑는다(실측 2026-08-27: 110,276행 + 88,304행).
 *     홈 화면이 방문마다 부르고 있어서 D1 읽기가 하루 2억 2,665만 행까지 올라갔다 —
 *     방문자 수십 명인 사이트에서 나올 수치가 아니고, 검색 크롤러가 붙으면 그대로 요금이 된다.
 *     `cache-control: max-age`는 **브라우저용**이라 엣지·D1을 지켜주지 못한다(그래서 안 막혔다).
 *     기사 수는 하루 한 번 수집 때만 바뀌므로 6시간이면 충분하다.
 */
const STATS_TTL_MS = 6 * 3600_000;

archiveRouter.get("/stats", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ total: 0, minYear: null, maxYear: null, categories: {} });

  const cached = await db.prepare("SELECT v, ts FROM kv_cache WHERE k='archive_stats'")
    .first<{ v: string; ts: number }>().catch(() => null);
  if (cached && Date.now() - Number(cached.ts) < STATS_TTL_MS) {
    return new Response(cached.v, {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=21600" },
    });
  }

  try {
    const [agg, cats, years] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS total, MIN(year) AS minYear, MAX(year) AS maxYear FROM archive_articles WHERE COALESCE(is_ad,0)=0")
        .first<{ total: number; minYear: number | null; maxYear: number | null }>(),
      db
        .prepare("SELECT category, COUNT(*) AS n FROM archive_articles WHERE category IS NOT NULL AND COALESCE(is_ad,0)=0 GROUP BY category")
        .all<{ category: string; n: number }>(),
      // idx_archive_year 를 타는 집계다. 6시간 캐시라 하루 네 번만 돈다.
      db
        .prepare("SELECT year, COUNT(*) AS n FROM archive_articles WHERE year IS NOT NULL AND COALESCE(is_ad,0)=0 GROUP BY year")
        .all<{ year: number; n: number }>(),
    ]);
    const body = JSON.stringify({
      total: agg?.total ?? 0,
      minYear: agg?.minYear ?? null,
      maxYear: agg?.maxYear ?? null,
      categories: toCategoryCounts(cats.results ?? []),
      years: toYearCounts(years.results ?? [], agg?.minYear ?? null, agg?.maxYear ?? null),
    });
    // 다음 요청부터는 표를 훑지 않는다. 저장 실패해도 응답은 그대로 낸다.
    c.executionCtx.waitUntil(
      db.prepare("INSERT INTO kv_cache (k,v,ts) VALUES ('archive_stats',?1,?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, ts=excluded.ts")
        .bind(body, Date.now()).run().then(() => {}).catch(() => {}),
    );
    return new Response(body, {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=21600" },
    });
  } catch {
    // 옛 캐시라도 있으면 그것을 낸다 — 0건으로 보이면 화면이 "아카이브 없음"처럼 보인다.
    if (cached) {
      return new Response(cached.v, { headers: { "content-type": "application/json; charset=utf-8" } });
    }
    return c.json({ total: 0, minYear: null, maxYear: null, categories: {} });
  }
});

type OtdRow = { idxno: number; title: string; published_at: string; year: number; category: string; exact: number };

// 후보 풀(오늘 ±3일 주요뉴스)을 D1 캐시 — 매 요청 substr 스캔(~1.4s) 회피. 무작위 선택은 JS.
async function loadOtdPool(db: D1Database, kst: Date, curYear: number): Promise<OtdRow[]> {
  const today = `${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  const { readCache, writeCache } = await import("../lib/api_cache");
  const cached = await readCache<OtdRow[]>(db, `otd:${today}`);
  if (cached && cached.value.length && cached.ageMs < 6 * 3600_000) return cached.value;

  const mmdds = new Set<string>();
  for (let d = -3; d <= 3; d++) {
    const t = new Date(kst.getTime() + d * 86400000);
    mmdds.add(`${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`);
  }
  const list = [...mmdds];
  const ph = list.map((_, i) => `?${i + 1}`).join(",");
  const r = await db
    .prepare(
      `SELECT idxno,title,published_at,year,category,
              (substr(published_at,6,5)=?${list.length + 2}) AS exact
       FROM archive_articles
       WHERE substr(published_at,6,5) IN (${ph}) AND year < ?${list.length + 1} AND ${ON_THIS_DAY_MAJOR}
       ORDER BY exact DESC LIMIT 200`,
    )
    .bind(...list, curYear, today)
    .all<OtdRow>();
  const pool = r.results ?? [];
  await writeCache(db, `otd:${today}`, pool);
  return pool;
}

archiveRouter.get("/on-this-day", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ items: [] });
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const curYear = kst.getUTCFullYear();
  const limit = Math.min(20, Math.max(1, Number(c.req.query("limit") || "8") || 8));
  const today = `${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;

  try {
    const pool = await loadOtdPool(db, kst, curYear);
    // 연도별 후보 그룹 → 연도당 1건 무작위(정확 일자 우선) → 연도 다양하게 8개 → 과거순 정렬
    const byYear = new Map<number, OtdRow[]>();
    for (const row of pool) { const a = byYear.get(row.year) ?? []; a.push(row); byYear.set(row.year, a); }
    const picks: OtdRow[] = [];
    for (const [, rows] of byYear) {
      const exact = rows.filter((r) => r.exact);
      const from = exact.length ? exact : rows;
      picks.push(from[Math.floor(Math.random() * from.length)]);
    }
    for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
    const chosen = picks.slice(0, limit).sort((a, b) => a.year - b.year || a.published_at.localeCompare(b.published_at));
    return c.json({
      date: today,
      items: chosen.map((x) => ({
        idxno: x.idxno, title: x.title, year: x.year,
        yearsAgo: curYear - x.year, category: x.category, leadImage: null, date: x.published_at.slice(5, 10),
      })),
    });
  } catch {
    return c.json({ items: [] });
  }
});

archiveRouter.get("/related/:idxno{[0-9]+}", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ items: [] });
  const idxno = Number(c.req.param("idxno"));
  const self = await db
    .prepare("SELECT title, category, published_at FROM archive_articles WHERE idxno = ?")
    .bind(idxno)
    .first<{ title: string; category: string; published_at: string }>();
  if (!self) return c.json({ items: [] });
  const adb: D1Database = db;
  const cols = "idxno,title,published_at,year,category,lead_image";

  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const PAGE = 6;
  const offset = (page - 1) * PAGE;

  // 주제(제목 키워드) 매칭 — 시간 무관, 최근순.
  // ⚠ 제목 LIKE 풀스캔은 쓰지 않는다. 선행 와일드카드라 색인을 못 타 한 번에 표 전체(11만 행)를
  //   읽고, 2026-10-17 에 그것 하나로 하루 3억 8,620만 행을 읽어 D1 이 넘어갔다(/news 500).
  //   트라이그램 색인 archive_fts 는 같은 일을 7천 행·20ms 로 한다.
  const kws = relatedKeywords(self.title ?? "");
  const ftsKws = kws.filter((k) => k.length >= FTS_MIN); // 2글자는 트라이그램이 못 찾는다
  const byCategory = {
    base: `FROM archive_articles a WHERE a.category = ? AND a.idxno != ?`,
    binds: [self.category, idxno] as unknown[],
    mode: "category",
  };

  let plan = byCategory;
  if (ftsKws.length) {
    plan = {
      base:
        "FROM archive_fts f JOIN archive_articles a ON a.idxno = f.rowid " +
        "WHERE archive_fts MATCH ? AND f.rowid != ?",
      binds: [titleMatchQuery(ftsKws), idxno],
      mode: "topic",
    };
  }

  // 건수와 목록을 한 번씩만, 나란히 묻는다(예전엔 같은 COUNT 를 두 번 돌렸다).
  const run = async (p: typeof byCategory) => {
    const [cnt, rows] = await Promise.all([
      adb.prepare(`SELECT COUNT(*) n ${p.base}`).bind(...p.binds).first<{ n: number }>(),
      adb
        .prepare(`SELECT ${cols.replace(/(\w+)/g, "a.$1")} ${p.base} ORDER BY a.published_at DESC LIMIT ? OFFSET ?`)
        .bind(...p.binds, PAGE, offset)
        .all(),
    ]);
    return { total: cnt?.n ?? 0, rows };
  };

  let out = await run(plan);
  if (out.total === 0 && plan.mode === "topic") {
    plan = byCategory; // 제목으로 걸리는 게 없으면 같은 분류로
    out = await run(plan);
  }

  return c.json({
    items: out.rows.results ?? [],
    total: out.total,
    page,
    pageSize: PAGE,
    mode: plan.mode,
    keywords: plan.mode === "topic" ? ftsKws : [],
  });
});

// 기사 1건 (전문 포함)
archiveRouter.get("/:idxno{[0-9]+}", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const idxno = Number(c.req.param("idxno"));
  const row = await db.prepare("SELECT * FROM archive_articles WHERE idxno = ?").bind(idxno).first();
  if (!row) return c.json({ error: "not_found" }, 404);
  // 지면에서 이 기사가 차지한 자리 — 원본 스캔 위에 짚어주기 위해. 없으면 안 그린다.
  //   전자북 대역만 조회한다(현대 기사엔 지면 스캔이 없다).
  let region: unknown = null;
  if (idxno >= 90000001 && idxno <= 90099999) {
    const g = await db.prepare("SELECT boxes_json, matched FROM ebook_regions WHERE idxno = ?")
      .bind(idxno).first<{ boxes_json: string; matched: number }>()
      .catch(() => null);                      // 표가 아직 없어도 기사는 열려야 한다
    if (g) region = { boxes: safeJson(g.boxes_json), matched: Number(g.matched) || 0 };
  }
  return c.json({ ...row, images: safeJson(row.images), region, isAd: Number(row.is_ad) === 1 });
});

// ── 지면 광고 훑어보기 ────────────────────────────────────────────────────
//   광고는 숨길 것이 아니라 **따로 보여줄 자료**다 — 1990~2001년 태안의 전세·매매가와
//   구인 임금이 여기 있다(금액이 적힌 것만 3,788건). 군청 통계에도 없는 읍면 단위 시세다.
//   기사 검색에서는 빼되(섞이면 노이즈), 이 경로로는 연도·갈래별로 훑어볼 수 있게 한다.
archiveRouter.get("/ads/years", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const r = await db.prepare(
    "SELECT year, COUNT(*) AS n FROM archive_articles WHERE COALESCE(is_ad,0)=1 GROUP BY year ORDER BY year",
  ).all().catch(() => null);                    // null = 조회 실패, [] = 아직 표시 전
  const years = r?.results ?? [];
  const rule = cacheRule({ failed: r === null, empty: years.length === 0, maxAge: 86400 });
  const res = rule.status === 503 ? c.json({ error: "archive_query_failed" }, 503) : c.json({ years });
  res.headers.set("Cache-Control", rule.cacheControl);
  return res;
});

archiveRouter.get("/ads", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const year = Number(c.req.query("year"));
  const q = (c.req.query("q") ?? "").trim();
  // 검색어가 없으면 연도가 있어야 한다(연도별 훑어보기).
  if (!q && !Number.isInteger(year)) return c.json({ error: "invalid_year" }, 400);
  const want = c.req.query("kind") ?? "";
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const SIZE = 60;

  // 갈래는 저장돼 있지 않다 — 읽어서 여기서 가른다.
  //   검색어가 있으면 **연도를 넘어** 전체에서 찾는다(연도를 정해 두면 그 해만).
  //   훑어보기만 있고 찾기가 없으면 1만 2천 건은 자료로 못 쓴다.
  const cols = "idxno, title, section, published_at, ad_key, substr(COALESCE(body,''),1,200) AS b";
  const r = await (q.length >= 2
    ? (q.length >= 3
      // 3글자 이상은 FTS(트라이그램), 2글자는 제목 LIKE — 기사 검색과 같은 규칙.
      ? db.prepare(
          `SELECT ${cols.replace(/\b(idxno|title|section|published_at|ad_key|body)\b/g, "a.$1")} ` +
          "FROM archive_fts f JOIN archive_articles a ON a.idxno=f.rowid " +
          "WHERE archive_fts MATCH ? AND COALESCE(a.is_ad,0)=1" + (Number.isInteger(year) ? " AND a.year=?" : "") +
          " ORDER BY a.published_at LIMIT 600",
        ).bind(...(Number.isInteger(year) ? [q, year] : [q]))
      : db.prepare(
          `SELECT ${cols} FROM archive_articles ` +
          "WHERE COALESCE(is_ad,0)=1 AND title LIKE ?" + (Number.isInteger(year) ? " AND year=?" : "") +
          " ORDER BY published_at LIMIT 600",
        ).bind(...(Number.isInteger(year) ? [`%${q}%`, year] : [`%${q}%`])))
    : db.prepare(
        `SELECT ${cols} FROM archive_articles WHERE COALESCE(is_ad,0)=1 AND year=? ORDER BY published_at, idxno`,
      ).bind(year)
  ).all<{ idxno: number; title: string; section: string; published_at: string; ad_key: string | null; b: string }>()
    .catch(() => null);
  // 조회 자체가 실패했으면 여기서 접는다 — '광고가 없다'로 둔갑시켜 캐시하면 안 된다.
  if (r === null) {
    const res = c.json({ error: "archive_query_failed" }, 503);
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  const rows = r.results ?? [];

  // 같은 광고 접기 — 반복 게재(ad_key 동일)는 첫 번째 것만 남긴다(마이그레이션 056).
  //   신도신협 같은 광고는 한 해에만 수십 번 실려, 안 접으면 목록이 그 광고로 도배된다.
  const seenKey = new Set<string>();
  const foldedRows = rows.filter((x) => {
    if (!x.ad_key) return true;
    if (seenKey.has(x.ad_key)) return false;
    seenKey.add(x.ad_key);
    return true;
  });

  const tagged = foldedRows.map((x) => ({ ...x, kind: adKind({ title: x.title, body: x.b }) }));
  const counts: Record<string, number> = {};
  for (const t of tagged) counts[t.kind] = (counts[t.kind] ?? 0) + 1;
  const picked = want ? tagged.filter((t) => t.kind === want) : tagged;
  const pageItems = picked.slice((page - 1) * SIZE, page * SIZE);

  // 화면에 나갈 것들만 게재 이력(총 몇 회·몇 년~몇 년)을 붙인다 — 한 번의 IN 조회.
  const keys = [...new Set(pageItems.map((x) => x.ad_key).filter((k): k is string => !!k))];
  const runs = new Map<string, { n: number; y0: number; y1: number }>();
  if (keys.length) {
    const g = await db.prepare(
      "SELECT ad_key, COUNT(*) AS n, MIN(year) AS y0, MAX(year) AS y1 FROM archive_articles " +
      `WHERE ad_key IN (${keys.map(() => "?").join(",")}) GROUP BY ad_key`,
    ).bind(...keys).all<{ ad_key: string; n: number; y0: number; y1: number }>().catch(() => null);
    for (const x of g?.results ?? []) runs.set(x.ad_key, { n: x.n, y0: x.y0, y1: x.y1 });
  }

  const res = c.json({
    year: Number.isInteger(year) ? year : null, q: q || null, kind: want || null, counts, total: picked.length,
    page, totalPages: Math.max(1, Math.ceil(picked.length / SIZE)),
    items: pageItems.map(({ ad_key, ...x }) => ({ ...x, runs: (ad_key && runs.get(ad_key)) || null })),
  });
  res.headers.set("Cache-Control",
    cacheRule({ failed: false, empty: picked.length === 0, maxAge: 86400 }).cacheControl);
  return res;
});

// ── 옛날 물가 — 광고에서 뽑은 시세표 ─────────────────────────────────────
//   ad_prices 는 광고 본문에서 라벨(전세·매매…) 붙은 금액을 뽑아둔 표(마이그레이션 055).
//   행이 3천 개 남짓이라 통째로 읽어 여기서 중앙값을 낸다 — D1엔 median이 없다.
archiveRouter.get("/ads/prices", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const r = await db.prepare("SELECT label, year, man FROM ad_prices").all<{ label: string; year: number; man: number }>()
    .catch(() => null);
  // 2026-11-05: 여기서 실패를 빈 목록으로 삼켜 "아직 정리된 시세가 없습니다"가 하루 박제됐다.
  if (r === null) {
    const res = c.json({ error: "archive_query_failed" }, 503);
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  const rows = r.results ?? [];
  const byKey = new Map<string, number[]>();
  for (const x of rows) {
    const k = `${x.label}|${x.year}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(x.man);
  }
  const q = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const labels = PRICE_LABELS.map((label) => {
    const series = [];
    for (let year = 1990; year <= 2001; year++) {
      const v = byKey.get(`${label}|${year}`);
      if (!v || v.length === 0) continue;
      const s = [...v].sort((a, b) => a - b);
      series.push({ year, n: s.length, med: q(s, 0.5), p25: q(s, 0.25), p75: q(s, 0.75) });
    }
    return { label, total: series.reduce((a, x) => a + x.n, 0), series };
  }).filter((l) => l.total > 0);
  const res = c.json({ labels });
  res.headers.set("Cache-Control",
    cacheRule({ failed: false, empty: labels.length === 0, maxAge: 86400 }).cacheControl);
  return res;
});

// ── 30년 전 오늘의 광고 ──────────────────────────────────────────────────
//   같은 날짜(월-일 ±3일)의 옛 광고 하나를 날짜로 정해지는 규칙으로 뽑는다 —
//   하루 동안 누가 봐도 같은 광고가 나오고, 자정이 지나면 바뀐다. 주간지라
//   정확히 같은 날짜의 광고가 없는 날이 많아 ±3일 창을 쓴다.
archiveRouter.get("/ads/on-this-day", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const now = new Date(Date.now() + 9 * 3600 * 1000);           // KST
  const days: string[] = [];
  for (let d = -3; d <= 3; d++) {
    const t = new Date(now.getTime() + d * 86400 * 1000);
    days.push(`${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`);
  }
  const r = await db.prepare(
    "SELECT idxno, title, year, substr(published_at,1,10) AS date, substr(COALESCE(body,''),1,300) AS b " +
    "FROM archive_articles WHERE COALESCE(is_ad,0)=1 AND substr(published_at,6,5) IN (" +
    days.map(() => "?").join(",") + ") AND length(COALESCE(body,'')) >= 20 ORDER BY idxno",
  ).bind(...days).all<{ idxno: number; title: string; year: number; date: string; b: string }>().catch(() => null);
  if (r === null) {
    const res = c.json({ error: "archive_query_failed" }, 503);
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  const rows = r.results ?? [];
  // 오늘 날짜 창에 옛 광고가 없는 날은 정말 있다 — 없다는 건 사실이니 짧게만 담아둔다.
  if (!rows.length) {
    const res = c.json({ item: null });
    res.headers.set("Cache-Control", cacheRule({ failed: false, empty: true, maxAge: 3600 }).cacheControl);
    return res;
  }
  const seed = Number(`${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`);
  const pick = rows[seed % rows.length];
  const res = c.json({ item: { ...pick, yearsAgo: now.getUTCFullYear() - pick.year } });
  res.headers.set("Cache-Control", "public, s-maxage=3600");    // 자정을 크게 넘겨 묵지 않게 1시간
  return res;
});

// ── 과거신문(지면) 훑어보기 ────────────────────────────────────────────────
//   지면 스캔 7,343장을 R2에 넣어두고도 들어갈 길이 없었다(기사를 열어야만 보였다).
//   연도 목록 → 그 해 발행일·지면 목록. 스캔 자체는 아래 /photo 로 서빙된다.
archiveRouter.get("/papers/years", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const r = await db.prepare(
    `SELECT year,
            COUNT(DISTINCT substr(published_at,1,10)) AS issues,
            COUNT(DISTINCT substr(published_at,1,10) || section) AS pages,
            COUNT(*) AS articles
       FROM archive_articles
      WHERE idxno BETWEEN ?1 AND ?2 AND section LIKE '지면%'
      GROUP BY year ORDER BY year`,
  ).bind(EBOOK_MIN, EBOOK_MAX).all();
  const res = c.json({ years: r.results ?? [] });
  res.headers.set("Cache-Control", "public, s-maxage=86400");
  return res;
});

archiveRouter.get("/papers/:year{[0-9]{4}}", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const year = Number(c.req.param("year"));
  const r = await db.prepare(
    `SELECT substr(published_at,1,10) AS d, section, COUNT(*) AS n
       FROM archive_articles
      WHERE idxno BETWEEN ?1 AND ?2 AND year = ?3 AND section LIKE '지면%'
      GROUP BY d, section`,
  ).bind(EBOOK_MIN, EBOOK_MAX, year).all<IssueRow>();
  const issues = groupIssues(r.results ?? []);
  const res = c.json({ year, issues });
  res.headers.set("Cache-Control", "public, s-maxage=86400");
  return res;
});

// 한 지면에 실린 기사 목록 — 지면을 보다가 기사로 들어가는 길.
archiveRouter.get("/papers/:year{[0-9]{4}}/:date{[0-9-]+}/:no{[0-9]{1,2}}", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const date = c.req.param("date");
  const no = String(Number(c.req.param("no"))).padStart(2, "0");
  const r = await db.prepare(
    `SELECT idxno, title, excerpt FROM archive_articles
      WHERE idxno BETWEEN ?1 AND ?2 AND substr(published_at,1,10) = ?3 AND section = ?4
      ORDER BY idxno`,
  ).bind(EBOOK_MIN, EBOOK_MAX, date, `지면 ${no}면`).all();
  const res = c.json({ date, page: Number(no), articles: r.results ?? [] });
  res.headers.set("Cache-Control", "public, s-maxage=86400");
  return res;
});

// R2 사진 서빙
archiveRouter.get("/photo/:key{.+}", async (c) => {
  const bucket = c.env.ARCHIVE_PHOTOS;
  if (!bucket) return c.json({ error: "photos_unbound" }, 503);
  const key = c.req.param("key");
  const obj = await bucket.get(key);
  if (!obj) return c.json({ error: "not_found" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

function safeJson(v: unknown): unknown {
  if (typeof v !== "string") return v ?? [];
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
}
