// 관리자 회원 관리 — /api/admin/users (adminGuard 보호). role·plan 수동 부여(PG 연동 전).
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { canAssignRole, canModifyUser } from "./roles";
import { sessionUser, bearerToken, deriveRequesterRole } from "./session_guard";
import { hashPw, randHex } from "./router";

export const adminUsersRouter = new Hono<{ Bindings: Env }>();

// 사람이 읽기 쉬운 강한 임시 비밀번호(혼동 문자 0/O/1/l/I 제외, 14자). 서버가 생성 → 화면 1회 표시 → 저장은 해시로만.
function genTempPassword(): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  let s = ""; for (const b of bytes) s += alpha[b % alpha.length];
  return s;
}

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

// POST /api/admin/users/create — 기자 계정 직접 생성(superadmin). 임시 비밀번호를 서버가 생성해 1회 반환(화면 표시용).
//   비밀번호는 해시(pw_hash)로만 저장. reporter 임명 권한(superadmin)과 동일 게이트.
const createSchema = z.object({ email: z.string().email().max(120), displayName: z.string().max(40).optional() });
adminUsersRouter.post("/create", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const p = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input", hint: "이메일 형식" }, 400);
  const env = c.env as Env & { ADMIN_TOKEN?: string };
  const su = await sessionUser(db, bearerToken(c));
  const tokenOk = !!env.ADMIN_TOKEN && c.req.header("X-Admin-Token") === env.ADMIN_TOKEN;
  const requesterRole = deriveRequesterRole(su, tokenOk);
  if (!canAssignRole(requesterRole, "reporter")) return c.json({ error: "insufficient_privilege", hint: "기자 계정 생성은 superadmin만" }, 403);

  const email = p.data.email.toLowerCase().trim();
  const exists = await db.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if (exists) return c.json({ error: "email_taken", hint: "이미 있는 이메일" }, 409);

  const tempPassword = genTempPassword();
  const salt = randHex(16);
  const hash = await hashPw(tempPassword, salt);
  const uid = `u_${randHex(11)}`;
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO users (email, pw_hash, pw_salt, uid, display_name, role, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(email, hash, salt, uid, p.data.displayName ?? null, "reporter", now, now).run();
  return c.json({ ok: true, email, displayName: p.data.displayName ?? null, tempPassword }); // tempPassword는 이 응답에서만
});
