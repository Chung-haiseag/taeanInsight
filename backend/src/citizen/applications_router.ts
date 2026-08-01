// 관리자 — 시민기자 신청 목록/결정. adminGuard 하위 마운트(/api/admin/citizen-applications).
import { Hono } from "hono";
import type { Env } from "../types";
import { decisionToStatus, shouldPromoteToCitizen, shouldDemoteToUser } from "./applications";
import { sessionUser, bearerToken } from "../auth/session_guard";

export const citizenAppsRouter = new Hono<{ Bindings: Env }>();

// 목록(?status=pending|approved|rejected, 기본 전체). users 조인으로 이메일.
citizenAppsRouter.get("/", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const status = c.req.query("status");
  const base =
    "SELECT a.id, a.user_id, a.status, a.reason, a.applied_at, a.decided_at, u.email, u.role FROM citizen_applications a JOIN users u ON u.id=a.user_id";
  const q = status ? `${base} WHERE a.status=?1 ORDER BY a.applied_at DESC` : `${base} ORDER BY a.applied_at DESC`;
  const stmt = status ? db.prepare(q).bind(status) : db.prepare(q);
  const r = await stmt.all();
  return c.json({ applications: r.results ?? [] });
});

// 결정 {decision, reason?}. 승인이고 대상이 user면 role=citizen 승격.
citizenAppsRouter.post("/:id", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const id = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => ({}))) as { decision?: "approve" | "reject"; reason?: string };
  if (body.decision !== "approve" && body.decision !== "reject") return c.json({ error: "invalid_input" }, 400);
  const app = await db.prepare("SELECT user_id FROM citizen_applications WHERE id=?").bind(id).first<{ user_id: number }>();
  if (!app) return c.json({ error: "not_found" }, 404);
  const decider = await sessionUser(db, bearerToken(c));
  const now = new Date().toISOString();
  await db
    .prepare("UPDATE citizen_applications SET status=?1, reason=COALESCE(?2, reason), decided_at=?3, decided_by=?4 WHERE id=?5")
    .bind(decisionToStatus(body.decision), body.reason ?? null, now, decider?.id ?? null, id)
    .run();
  // 승인이면 user→citizen 승격, 반려면(이미 citizen이면) user로 회수 — 재결정 멱등성.
  const u = await db.prepare("SELECT role FROM users WHERE id=?").bind(app.user_id).first<{ role: string }>();
  if (u && shouldPromoteToCitizen(body.decision, u.role)) {
    await db.prepare("UPDATE users SET role='citizen' WHERE id=?").bind(app.user_id).run();
  } else if (u && shouldDemoteToUser(body.decision, u.role)) {
    await db.prepare("UPDATE users SET role='user' WHERE id=?").bind(app.user_id).run();
  }
  return c.json({ ok: true });
});
