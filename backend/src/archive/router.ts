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

// 관련 과거기사 — 같은 분류의 다른 기사(최신순). 추후 임베딩 의미검색으로 업그레이드.
archiveRouter.get("/related/:idxno{[0-9]+}", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ items: [] });
  const idxno = Number(c.req.param("idxno"));
  const self = await db.prepare("SELECT category FROM archive_articles WHERE idxno = ?").bind(idxno).first<{ category: string }>();
  if (!self) return c.json({ items: [] });
  const rows = await db
    .prepare(
      "SELECT idxno,title,published_at,year,category,lead_image FROM archive_articles WHERE category = ? AND idxno != ? ORDER BY published_at DESC LIMIT 6",
    )
    .bind(self.category, idxno)
    .all();
  return c.json({ items: rows.results ?? [] });
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
