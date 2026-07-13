// 전자북 기사 수정 요청 — 회원 제출 → 관리자 확인·반영
//  회원(identifyUser):
//   POST /api/archive/corrections        {idxno, selectedText, suggestion, note?}
//   GET  /api/archive/corrections/mine   내 요청 목록(내 페이지)
//  관리자(adminGuard, /api/admin/* 전역):
//   GET  /api/admin/corrections?status=  요청 목록 + 기사 제목·본문
//   POST /api/admin/corrections/:id      {action:'accept'|'reject', adminNote?}
// 본문 수정 자체는 PUT /api/admin/ebook/article/:idxno (ebook_review.ts).

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import { identifyUser, type AuthVariables } from "../auth/middleware";

const EBOOK_LO = 90000001, EBOOK_HI = 90099999;
const MAX_PENDING_PER_ARTICLE = 5; // 같은 회원·같은 기사 대기중 상한(스팸 방지)

export const correctionsRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
correctionsRouter.use("*", identifyUser((env) => (env as Env & { JWT_SECRET?: string }).JWT_SECRET ?? "dev-secret"));

const submitSchema = z.object({
  idxno: z.number().int().min(EBOOK_LO).max(EBOOK_HI),
  selectedText: z.string().trim().min(2).max(500),
  suggestion: z.string().trim().min(1).max(500),
  note: z.string().trim().max(300).optional(),
});

// 수정 요청 제출
correctionsRouter.post("/", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const p = submitSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: "invalid_input", detail: p.error.issues[0]?.message }, 400);
  const uid = c.get("auth").sub;

  const article = await db
    .prepare("SELECT idxno FROM archive_articles WHERE idxno=?")
    .bind(p.data.idxno)
    .first<{ idxno: number }>();
  if (!article) return c.json({ error: "article_not_found" }, 404);

  const pending = await db
    .prepare("SELECT COUNT(*) AS n FROM article_corrections WHERE uid=? AND idxno=? AND status='pending'")
    .bind(uid, p.data.idxno)
    .first<{ n: number }>();
  if ((pending?.n ?? 0) >= MAX_PENDING_PER_ARTICLE) {
    return c.json({ error: "too_many_pending", message: "이 기사에 검토 대기 중인 요청이 이미 많습니다" }, 429);
  }

  const r = await db
    .prepare("INSERT INTO article_corrections (idxno, uid, selected_text, suggestion, note) VALUES (?,?,?,?,?)")
    .bind(p.data.idxno, uid, p.data.selectedText, p.data.suggestion, p.data.note ?? null)
    .run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

// 내 요청 목록 — 내 페이지 "내 수정 요청"
correctionsRouter.get("/mine", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ items: [] });
  const uid = c.get("auth").sub;
  const rs = await db
    .prepare(
      `SELECT cr.id, cr.idxno, cr.selected_text AS selectedText, cr.suggestion, cr.note,
              cr.status, cr.admin_note AS adminNote, cr.created_at AS createdAt, cr.resolved_at AS resolvedAt,
              a.title
       FROM article_corrections cr LEFT JOIN archive_articles a ON a.idxno = cr.idxno
       WHERE cr.uid=? ORDER BY cr.created_at DESC LIMIT 50`,
    )
    .bind(uid)
    .all();
  return c.json({ items: rs.results ?? [] });
});

// ── 관리자 ──────────────────────────────────────────────

export const adminCorrectionsRouter = new Hono<{ Bindings: Env }>();

// 요청 목록 — status 필터(pending|accepted|rejected|all), 기사 제목·본문 동봉(처리 화면용)
adminCorrectionsRouter.get("/", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ items: [], counts: {} });
  const status = c.req.query("status") ?? "pending";
  let where = "1=1";
  const binds: unknown[] = [];
  if (["pending", "accepted", "rejected"].includes(status)) { where = "cr.status=?"; binds.push(status); }
  const rs = await db
    .prepare(
      `SELECT cr.id, cr.idxno, cr.uid, cr.selected_text AS selectedText, cr.suggestion, cr.note,
              cr.status, cr.admin_note AS adminNote, cr.created_at AS createdAt, cr.resolved_at AS resolvedAt,
              a.title, a.body, substr(a.published_at,1,10) AS publishedAt
       FROM article_corrections cr LEFT JOIN archive_articles a ON a.idxno = cr.idxno
       WHERE ${where} ORDER BY cr.created_at ASC LIMIT 100`,
    )
    .bind(...binds)
    .all();
  const counts = await db
    .prepare("SELECT status, COUNT(*) AS n FROM article_corrections GROUP BY status")
    .all<{ status: string; n: number }>();
  return c.json({
    items: rs.results ?? [],
    counts: Object.fromEntries((counts.results ?? []).map((r) => [r.status, r.n])),
  });
});

const resolveSchema = z.object({
  action: z.enum(["accept", "reject"]),
  adminNote: z.string().trim().max(300).optional(),
});

// 요청 처리 — 본문 수정은 별도(PUT /api/admin/ebook/article/:idxno) 후 여기서 상태 기록
adminCorrectionsRouter.post("/:id", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "archive_db_unbound" }, 503);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);
  const p = resolveSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: "invalid_input" }, 400);
  const status = p.data.action === "accept" ? "accepted" : "rejected";
  const r = await db
    .prepare("UPDATE article_corrections SET status=?, admin_note=?, resolved_at=datetime('now') WHERE id=? AND status='pending'")
    .bind(status, p.data.adminNote ?? null, id)
    .run();
  if (!r.meta.changes) return c.json({ error: "not_found_or_resolved" }, 404);
  return c.json({ ok: true, status });
});
