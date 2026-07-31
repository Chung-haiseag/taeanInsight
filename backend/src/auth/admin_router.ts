// 관리자 회원 관리 — /api/admin/users (adminGuard 보호). role·plan 수동 부여(PG 연동 전).
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { canAssignRole, canModifyUser } from "./roles";
import { sessionUser, bearerToken, deriveRequesterRole } from "./session_guard";

export const adminUsersRouter = new Hono<{ Bindings: Env }>();

adminUsersRouter.get("/", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const r = await db.prepare(
    "SELECT id, email, display_name, role, plan, provider, created_at, last_login_at FROM users ORDER BY id DESC LIMIT 200").all();
  return c.json({ users: r.results ?? [] });
});

const setSchema = z.object({
  id: z.number().int(),
  role: z.enum(["user", "citizen", "reporter", "admin", "superadmin"]).optional(),
  plan: z.enum(["free", "reader", "business", "org"]).optional(),
});
adminUsersRouter.post("/set", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const p = setSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success || (!p.data.role && !p.data.plan)) return c.json({ error: "invalid_input" }, 400);

  // 요청자 실효 등급 — 세션 role, 없고 X-Admin-Token 일치면 superadmin(루트 비상권).
  const env = c.env as Env & { ADMIN_TOKEN?: string };
  const su = await sessionUser(db, bearerToken(c));
  const tokenOk = !!env.ADMIN_TOKEN && c.req.header("X-Admin-Token") === env.ADMIN_TOKEN;
  const requesterRole = deriveRequesterRole(su, tokenOk);

  // 대상의 현재 등급을 조회해 강등 보호(요청자보다 상위 대상 변경 금지).
  const target = await db.prepare("SELECT role FROM users WHERE id=?").bind(p.data.id).first<{ role: string }>();
  if (!target) return c.json({ error: "not_found" }, 404);
  if (!canModifyUser(requesterRole, target.role)) {
    return c.json({ error: "insufficient_privilege", hint: "상위 등급 회원은 변경할 수 없음" }, 403);
  }

  if (p.data.role && !canAssignRole(requesterRole, p.data.role)) {
    return c.json({ error: "insufficient_privilege", hint: "reporter·admin 임명은 superadmin만" }, 403);
  }
  if (p.data.role) await db.prepare("UPDATE users SET role=? WHERE id=?").bind(p.data.role, p.data.id).run();
  if (p.data.plan) await db.prepare("UPDATE users SET plan=? WHERE id=?").bind(p.data.plan, p.data.id).run();
  return c.json({ ok: true });
});
