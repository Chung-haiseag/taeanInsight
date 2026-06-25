// 기자 취재 알림 API — 등록·키워드 관리·알림 인박스·수동 실행.
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";

export const reporterRouter = new Hono<{ Bindings: Env }>();

function uidOf(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const u = c.req.header("X-Taean-Uid");
  return u && /^[A-Za-z0-9_-]{8,64}$/.test(u) ? u : null;
}

// GET /api/reporter/me — 내 기자 등록·키워드 상태
reporterRouter.get("/me", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ registered: false, keywords: [] });
  const uid = uidOf(c);
  if (!uid) return c.json({ registered: false, keywords: [] });
  const reg = await c.env.ARCHIVE_DB.prepare("SELECT uid FROM reporters WHERE uid=?").bind(uid).first();
  const kw = await c.env.ARCHIVE_DB.prepare("SELECT id, keyword FROM reporter_keywords WHERE uid=? ORDER BY id").bind(uid).all<{ id: number; keyword: string }>();
  return c.json({ registered: !!reg, keywords: kw.results ?? [] });
});

// POST /api/reporter/register — 취재 알림 수신 등록
reporterRouter.post("/register", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ ok: false }, 503);
  const uid = uidOf(c);
  if (!uid) return c.json({ ok: false, error: "no_identity" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.slice(0, 40) : null;
  await c.env.ARCHIVE_DB
    .prepare("INSERT INTO reporters (uid, name, created_at) VALUES (?,?,?) ON CONFLICT(uid) DO UPDATE SET name=excluded.name")
    .bind(uid, name, new Date().toISOString()).run();
  return c.json({ ok: true });
});

// DELETE /api/reporter/register — 수신 해제
reporterRouter.delete("/register", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ ok: false }, 503);
  const uid = uidOf(c);
  if (!uid) return c.json({ ok: false }, 401);
  await c.env.ARCHIVE_DB.prepare("DELETE FROM reporters WHERE uid=?").bind(uid).run();
  return c.json({ ok: true });
});

const kwSchema = z.object({ keyword: z.string().min(2).max(30) });

// POST /api/reporter/keywords — 감시 키워드 추가
reporterRouter.post("/keywords", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ ok: false }, 503);
  const uid = uidOf(c);
  if (!uid) return c.json({ ok: false }, 401);
  const parsed = kwSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ ok: false, error: "invalid" }, 400);
  const kw = parsed.data.keyword.trim();
  const dup = await c.env.ARCHIVE_DB.prepare("SELECT id FROM reporter_keywords WHERE uid=? AND keyword=?").bind(uid, kw).first();
  if (!dup) {
    const cnt = await c.env.ARCHIVE_DB.prepare("SELECT COUNT(*) AS n FROM reporter_keywords WHERE uid=?").bind(uid).first<{ n: number }>();
    if ((cnt?.n ?? 0) >= 20) return c.json({ ok: false, error: "limit" }, 422);
    await c.env.ARCHIVE_DB.prepare("INSERT INTO reporter_keywords (uid, keyword, created_at) VALUES (?,?,?)").bind(uid, kw, new Date().toISOString()).run();
  }
  return c.json({ ok: true });
});

// DELETE /api/reporter/keywords/:id
reporterRouter.delete("/keywords/:id", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ ok: false }, 503);
  const uid = uidOf(c);
  if (!uid) return c.json({ ok: false }, 401);
  await c.env.ARCHIVE_DB.prepare("DELETE FROM reporter_keywords WHERE id=? AND uid=?").bind(Number(c.req.param("id")), uid).run();
  return c.json({ ok: true });
});

// GET /api/reporter/alerts — 최근 취재 알림 인박스(전체 + 내 키워드)
reporterRouter.get("/alerts", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ alerts: [] });
  const uid = uidOf(c);
  const r = await c.env.ARCHIVE_DB
    .prepare("SELECT kind, title, body, url, created_at FROM reporter_alerts WHERE target_uid IS NULL OR target_uid=? ORDER BY created_at DESC, id DESC LIMIT 40")
    .bind(uid ?? "").all();
  return c.json({ alerts: r.results ?? [] });
});

// POST /api/reporter/run — 수동 트리거 점검·발송(관리자 토큰)
reporterRouter.post("/run", async (c) => {
  const token = c.req.header("X-Admin-Token");
  const expected = (c.env as Env & { GOV_IMPORT_TOKEN?: string }).GOV_IMPORT_TOKEN;
  if (!expected || token !== expected) return c.json({ error: "unauthorized" }, 401);
  const { runReporterAlerts } = await import("./alerts");
  return c.json(await runReporterAlerts(c.env));
});
