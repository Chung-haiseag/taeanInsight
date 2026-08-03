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
    "SELECT id, email, username, display_name, role, plan, provider, created_at, last_login_at FROM users ORDER BY id DESC LIMIT 200").all();
  return c.json({ users: r.results ?? [] });
});

const setSchema = z.object({
  id: z.number().int(),
  role: z.enum(["user", "citizen", "reporter", "admin", "superadmin"]).optional(),
  plan: z.enum(["free", "reader", "business", "org"]).optional(),
  displayName: z.string().max(40).optional(), // 이름 수정
});
adminUsersRouter.post("/set", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const p = setSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success || (!p.data.role && !p.data.plan && p.data.displayName === undefined)) return c.json({ error: "invalid_input" }, 400);

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
  if (p.data.displayName !== undefined) await db.prepare("UPDATE users SET display_name=? WHERE id=?").bind(p.data.displayName || null, p.data.id).run();
  return c.json({ ok: true });
});

// POST /api/admin/users/reset-password — 비밀번호 재설정(관리자). 지정 또는 자동, 새 비번 1회 반환. 기존 세션 무효화.
const resetSchema = z.object({ id: z.number().int(), password: z.string().min(8).max(200).optional() });
adminUsersRouter.post("/reset-password", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const p = resetSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input", hint: "비밀번호 8자 이상(비우면 자동)" }, 400);
  const env = c.env as Env & { ADMIN_TOKEN?: string };
  const su = await sessionUser(db, bearerToken(c));
  const tokenOk = !!env.ADMIN_TOKEN && c.req.header("X-Admin-Token") === env.ADMIN_TOKEN;
  const requesterRole = deriveRequesterRole(su, tokenOk);
  const target = await db.prepare("SELECT role, email FROM users WHERE id=?").bind(p.data.id).first<{ role: string; email: string }>();
  if (!target) return c.json({ error: "not_found" }, 404);
  if (!canModifyUser(requesterRole, target.role)) return c.json({ error: "insufficient_privilege" }, 403);
  const newPassword = p.data.password ?? genTempPassword();
  const salt = randHex(16);
  const hash = await hashPw(newPassword, salt);
  await db.prepare("UPDATE users SET pw_hash=?, pw_salt=? WHERE id=?").bind(hash, salt, p.data.id).run();
  await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(p.data.id).run(); // 기존 로그인 무효화
  return c.json({ ok: true, email: target.email, tempPassword: newPassword });
});

// POST /api/admin/users/delete — 회원 삭제. 상위/동급·본인은 삭제 금지. 세션도 함께 삭제.
const delSchema = z.object({ id: z.number().int() });
adminUsersRouter.post("/delete", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const p = delSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input" }, 400);
  const env = c.env as Env & { ADMIN_TOKEN?: string };
  const su = await sessionUser(db, bearerToken(c));
  const tokenOk = !!env.ADMIN_TOKEN && c.req.header("X-Admin-Token") === env.ADMIN_TOKEN;
  const requesterRole = deriveRequesterRole(su, tokenOk);
  if (su && su.id === p.data.id) return c.json({ error: "cannot_delete_self", hint: "본인 계정은 삭제할 수 없음" }, 400);
  const target = await db.prepare("SELECT role FROM users WHERE id=?").bind(p.data.id).first<{ role: string }>();
  if (!target) return c.json({ error: "not_found" }, 404);
  if (!canModifyUser(requesterRole, target.role) || target.role === "superadmin") {
    return c.json({ error: "insufficient_privilege", hint: "상위 등급·최종관리자는 삭제 불가" }, 403);
  }
  await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(p.data.id).run();
  await db.prepare("DELETE FROM users WHERE id=?").bind(p.data.id).run();
  return c.json({ ok: true });
});

// POST /api/admin/users/create — 기자 계정 직접 생성(superadmin). 임시 비밀번호를 서버가 생성해 1회 반환(화면 표시용).
//   비밀번호는 해시(pw_hash)로만 저장. reporter 임명 권한(superadmin)과 동일 게이트.
const createSchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9._-]{3,30}$/, "3~30자 영문·숫자·._-").optional(), // 단순 아이디(이메일 없이 로그인)
  email: z.string().email().max(120).optional(),
  displayName: z.string().max(40).optional(),
  password: z.string().min(8).max(200).optional(), // 직접 지정(8자+). 비우면 서버가 자동 생성.
}).refine((d) => !!(d.username || d.email), { message: "아이디 또는 이메일 필요" });
adminUsersRouter.post("/create", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const p = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input", hint: "아이디(3~30자 영문·숫자) 또는 이메일 · 비번 8자+(비우면 자동)" }, 400);
  const env = c.env as Env & { ADMIN_TOKEN?: string };
  const su = await sessionUser(db, bearerToken(c));
  const tokenOk = !!env.ADMIN_TOKEN && c.req.header("X-Admin-Token") === env.ADMIN_TOKEN;
  const requesterRole = deriveRequesterRole(su, tokenOk);
  if (!canAssignRole(requesterRole, "reporter")) return c.json({ error: "insufficient_privilege", hint: "기자 계정 생성은 superadmin만" }, 403);

  const username = p.data.username ? p.data.username.toLowerCase().trim() : null;
  // 이메일 미입력 시 내부 합성 이메일(NOT NULL 제약 충족용, 로그인엔 아이디 사용).
  const email = p.data.email ? p.data.email.toLowerCase().trim() : `${username}@kija.taeannews.local`;
  if (username && await db.prepare("SELECT id FROM users WHERE username=?").bind(username).first()) return c.json({ error: "username_taken", hint: "이미 있는 아이디" }, 409);
  if (await db.prepare("SELECT id FROM users WHERE email=?").bind(email).first()) return c.json({ error: "email_taken", hint: "이미 있는 이메일/아이디" }, 409);

  const tempPassword = p.data.password ?? genTempPassword(); // 지정 비번 우선, 없으면 자동 생성
  const salt = randHex(16);
  const hash = await hashPw(tempPassword, salt);
  const uid = `u_${randHex(11)}`;
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO users (email, username, pw_hash, pw_salt, uid, display_name, role, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(email, username, hash, salt, uid, p.data.displayName ?? null, "reporter", now, now).run();
  return c.json({ ok: true, loginId: username ?? email, username, email, displayName: p.data.displayName ?? null, tempPassword }); // tempPassword는 이 응답에서만
});
