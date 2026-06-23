// 태안신문 아카이브 API — D1(텍스트·검색) + R2(사진).
// 백필(tools/backfill) → D1 적재 + R2 업로드 후 동작. 데이터 없으면 빈 결과 반환.
//   GET /api/archive/search?q=&category=&year=&page=  전문 검색(FTS5, LIKE 폴백)
//   GET /api/archive/:idxno                            기사 1건(전문 — 회원 게이트는 프론트)
//   GET /api/archive/photo/:key                        R2 사진 서빙(공개)

import { Hono } from "hono";

import type { Env } from "../types";

export const archiveRouter = new Hono<{ Bindings: Env }>();

const PAGE_SIZE = 20;

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
  if (category) {
    filters.push("a.category = ?");
    binds.push(category);
  }
  if (year) {
    filters.push("a.year = ?");
    binds.push(Number(year));
  }

  const cols = "idxno,title,published_at,year,section,category,author,excerpt,lead_image,members_only";

  // FTS5 트라이그램은 3글자 이상만 매칭 → 긴 질의는 FTS, 짧은 질의는 LIKE
  async function ftsSearch() {
    const where = ["archive_fts MATCH ?", ...filters].join(" AND ");
    const sql =
      `SELECT ${cols.replace(/(\w+)/g, "a.$1")} FROM archive_fts f JOIN archive_articles a ON a.idxno = f.rowid ` +
      `WHERE ${where} ORDER BY a.published_at DESC LIMIT ? OFFSET ?`;
    return adb.prepare(sql).bind(q, ...binds, PAGE_SIZE, offset).all();
  }
  async function likeSearch() {
    const where = ["(a.title LIKE ? OR a.body LIKE ?)", ...filters].join(" AND ");
    const like = `%${q}%`;
    const sql =
      `SELECT ${cols} FROM archive_articles a WHERE ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`;
    return adb.prepare(sql).bind(like, like, ...binds, PAGE_SIZE, offset).all();
  }
  async function listOnly() {
    const where = filters.length ? "WHERE " + filters.join(" AND ") : "";
    const sql = `SELECT ${cols} FROM archive_articles a ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`;
    return adb.prepare(sql).bind(...binds, PAGE_SIZE, offset).all();
  }

  // 검색 목록 성능: 전자북 기사의 lead_image는 520KB 지면 스캔이라 20개면 ~10MB.
  // 80px 썸네일엔 과대 → 검색 목록에선 제거(상세 페이지의 원본 지면은 그대로). 백필/RSS 썸네일은 유지.
  const lite = (items: unknown[] = []) =>
    (items as Record<string, unknown>[]).map((it) => {
      const n = Number(it.idxno);
      return n >= 90000001 && n <= 90099999 ? { ...it, lead_image: null } : it;
    });

  // 다음 페이지 존재 여부: 이번 페이지가 가득 찼으면(=PAGE_SIZE) 더 있을 수 있음.
  // COUNT 전체 스캔(특히 2글자 LIKE)을 피하려고 hasMore 방식 사용.
  const reply = (rows: D1Result, mode: string) => {
    const items = rows.results ?? [];
    return c.json({ items: lite(items), page, pageSize: PAGE_SIZE, mode, hasMore: items.length === PAGE_SIZE });
  };

  try {
    if (!q) return reply(await listOnly(), "list");
    if (q.length >= 3) {
      const rows = await ftsSearch();
      if ((rows.results?.length ?? 0) > 0) return reply(rows, "fts");
    }
    return reply(await likeSearch(), "like"); // 짧은 질의 또는 FTS 0건
  } catch (e) {
    return c.json({ error: "search_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// 관련 "과거" 기사 — 제목 키워드로 주제 매칭 + 현재 기사보다 이전(published_at <) 우선.
// 주제 매칭이 부족하면 같은 분류의 과거 기사로 폴백. 추후 임베딩 의미검색으로 업그레이드.
const REL_STOP = new Set([
  "태안", "태안군", "주간", "우리", "위해", "관련", "오늘", "올해", "지난", "이번",
  "대회", "행사", "개최", "실시", "운영", "마련", "추진", "지원", "교육", "사업", "방문", "참여",
  "전면", "착용", "의무화", "확대", "강화", "재검토", "선정", "모집", "안내", "협약", "체결",
  "전국", "최대", "최초", "처음", "기념", "예정", "결정", "촉구", "주민", "지역",
]);

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

// 아카이브 전체 통계 — 총 건수·연도 범위(엣지 1시간 캐시).
archiveRouter.get("/stats", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ total: 0, minYear: null, maxYear: null });
  try {
    const r = await db.prepare("SELECT COUNT(*) AS total, MIN(year) AS minYear, MAX(year) AS maxYear FROM archive_articles").first<{ total: number; minYear: number | null; maxYear: number | null }>();
    return c.json(
      { total: r?.total ?? 0, minYear: r?.minYear ?? null, maxYear: r?.maxYear ?? null },
      { headers: { "cache-control": "public, max-age=3600" } },
    );
  } catch {
    return c.json({ total: 0, minYear: null, maxYear: null });
  }
});

archiveRouter.get("/on-this-day", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ items: [] });
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const curYear = kst.getUTCFullYear();
  const limit = Math.min(20, Math.max(1, Number(c.req.query("limit") || "8") || 8));
  const today = `${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;

  type Row = { idxno: number; title: string; published_at: string; year: number; category: string; lead_image: string | null };
  const toItems = (rows: Row[]) => rows.map((x) => ({
    idxno: x.idxno, title: x.title, year: x.year,
    yearsAgo: curYear - x.year, category: x.category, leadImage: x.lead_image ?? null, date: x.published_at.slice(5, 10),
  }));

  // 연도별 1건씩(특정 해 쏠림 방지) — 랜덤. dateCond/binds로 정확일자/±N일 모두 처리.
  const pickPerYear = async (dateCond: string, dateBinds: string[]): Promise<Row[]> => {
    const n = dateBinds.length;
    const r = await db
      .prepare(
        `WITH cand AS (
           SELECT idxno,title,published_at,year,category,lead_image,
                  ROW_NUMBER() OVER (PARTITION BY year ORDER BY RANDOM()) rn
           FROM archive_articles
           WHERE ${dateCond} AND year < ?${n + 1} AND ${ON_THIS_DAY_MAJOR}
         )
         SELECT idxno,title,published_at,year,category,lead_image FROM cand WHERE rn <= 1
         ORDER BY RANDOM() LIMIT ?${n + 2}`,
      )
      .bind(...dateBinds, curYear, limit)
      .all<Row>();
    return r.results ?? [];
  };
  const byYearAsc = (a: Row[]) => a.sort((x, y) => x.year - y.year || x.published_at.localeCompare(y.published_at));

  try {
    // 1) 정확히 같은 일자 — 연도별 1건
    let rows = await pickPerYear("substr(published_at,6,5)=?1", [today]);
    // 2) 해가 부족하면 ±3일로 보강(이미 나온 연도는 제외 → 연도 다양성↑)
    if (rows.length < limit) {
      const mmdds = new Set<string>();
      for (let d = -3; d <= 3; d++) {
        const t = new Date(kst.getTime() + d * 86400000);
        mmdds.add(`${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`);
      }
      const list = [...mmdds];
      const ph = list.map((_, i) => `?${i + 1}`).join(",");
      const wide = await pickPerYear(`substr(published_at,6,5) IN (${ph})`, list);
      const years = new Set(rows.map((r) => r.year));
      rows = [...rows, ...wide.filter((r) => !years.has(r.year))].slice(0, limit);
    }
    return c.json({ date: today, items: toItems(byYearAsc(rows)) });
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

  // 제목에서 키워드 추출 (2자 이상, 흔한 단어 제외, 최대 4개)
  const kws = [
    ...new Set(
      (self.title ?? "")
        .split(/[\s,.·…!?"'“”‘’()[\]/~\-—–]+/)
        .map((w) => w.trim())
        // 2자 이상 · 흔한 단어 제외 · 날짜/숫자 토큰 제외(7월, 1일부터, 2026, 20만 …)
        .filter((w) => w.length >= 2 && !REL_STOP.has(w) && !/^\d/.test(w)),
    ),
  ]
    .sort((a, b) => b.length - a.length) // 긴 단어(더 고유한 복합명사) 우선
    .slice(0, 3);

  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const PAGE = 6;
  const offset = (page - 1) * PAGE;

  // 주제(제목 키워드) 매칭 — 시간 무관, 최근순. 매칭이 0이면 같은 분류로 폴백.
  let where: string;
  let binds: unknown[];
  let mode: string;
  if (kws.length) {
    where = "(" + kws.map(() => "title LIKE ?").join(" OR ") + ") AND idxno != ?";
    binds = [...kws.map((k) => `%${k}%`), idxno];
    mode = "topic";
    const cnt = await adb.prepare(`SELECT COUNT(*) n FROM archive_articles WHERE ${where}`).bind(...binds).first<{ n: number }>();
    if (!cnt || cnt.n === 0) {
      where = "category = ? AND idxno != ?";
      binds = [self.category, idxno];
      mode = "category";
    }
  } else {
    where = "category = ? AND idxno != ?";
    binds = [self.category, idxno];
    mode = "category";
  }

  const total = (await adb.prepare(`SELECT COUNT(*) n FROM archive_articles WHERE ${where}`).bind(...binds).first<{ n: number }>())?.n ?? 0;
  const rows = await adb
    .prepare(`SELECT ${cols} FROM archive_articles WHERE ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, PAGE, offset)
    .all();
  return c.json({ items: rows.results ?? [], total, page, pageSize: PAGE, mode, keywords: kws });
});

// 기사 1건 (전문 포함)
archiveRouter.get("/:idxno{[0-9]+}", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const idxno = Number(c.req.param("idxno"));
  const row = await db.prepare("SELECT * FROM archive_articles WHERE idxno = ?").bind(idxno).first();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ...row, images: safeJson(row.images) });
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
