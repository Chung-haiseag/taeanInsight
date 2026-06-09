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

  try {
    if (!q) {
      const rows = await listOnly();
      return c.json({ items: rows.results ?? [], page, pageSize: PAGE_SIZE, mode: "list" });
    }
    if (q.length >= 3) {
      const rows = await ftsSearch();
      if ((rows.results?.length ?? 0) > 0) return c.json({ items: rows.results, page, pageSize: PAGE_SIZE, mode: "fts" });
    }
    const rows = await likeSearch(); // 짧은 질의 또는 FTS 0건
    return c.json({ items: rows.results ?? [], page, pageSize: PAGE_SIZE, mode: "like" });
  } catch (e) {
    return c.json({ error: "search_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// 관련 "과거" 기사 — 제목 키워드로 주제 매칭 + 현재 기사보다 이전(published_at <) 우선.
// 주제 매칭이 부족하면 같은 분류의 과거 기사로 폴백. 추후 임베딩 의미검색으로 업그레이드.
const REL_STOP = new Set([
  "태안", "태안군", "주간", "우리", "위해", "관련", "오늘", "올해", "지난", "이번",
  "대회", "행사", "개최", "실시", "운영", "마련", "추진", "지원", "교육", "사업", "방문", "참여",
]);

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
  const before = self.published_at ?? "9999";

  // 제목에서 키워드 추출 (2자 이상, 흔한 단어 제외, 최대 4개)
  const kws = [
    ...new Set(
      (self.title ?? "")
        .split(/[\s,.·…!?"'“”‘’()[\]/~\-—–]+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2 && !REL_STOP.has(w)),
    ),
  ].slice(0, 4);

  async function topicPast() {
    if (!kws.length) return { results: [] };
    const where = "(" + kws.map(() => "title LIKE ?").join(" OR ") + ") AND idxno != ? AND published_at < ?";
    const sql = `SELECT ${cols} FROM archive_articles WHERE ${where} ORDER BY published_at DESC LIMIT 6`;
    return adb.prepare(sql).bind(...kws.map((k) => `%${k}%`), idxno, before).all();
  }
  async function categoryPast() {
    const sql = `SELECT ${cols} FROM archive_articles WHERE category = ? AND idxno != ? AND published_at < ? ORDER BY published_at DESC LIMIT 6`;
    return adb.prepare(sql).bind(self.category, idxno, before).all();
  }

  let rows = await topicPast();
  let mode = "topic";
  if ((rows.results?.length ?? 0) < 3) {
    rows = await categoryPast();
    mode = "category";
  }
  return c.json({ items: rows.results ?? [], mode, keywords: kws });
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
