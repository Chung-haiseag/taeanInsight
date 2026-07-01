// 계정·로그인 — Cloudflare 네이티브(D1 + Web Crypto PBKDF2, 외부 인증/서명키 불필요).
// 익명 uid를 계정에 귀속 → 로그인 시 정규 uid 반환으로 기기 간 개인화 동기화.

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";

export const authRouter = new Hono<{ Bindings: Env }>();

const SESSION_DAYS = 90;
const enc = new TextEncoder();

function uidOf(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const u = c.req.header("X-Taean-Uid");
  return u && /^[A-Za-z0-9_-]{8,64}$/.test(u) ? u : null;
}
function bearer(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const h = c.req.header("Authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}
function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randHex(bytes = 32): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
}
async function hashPw(pw: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" }, key, 256);
  return toHex(bits);
}
// 타이밍 안전 비교
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = randHex(32);
  const now = Date.now();
  await db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)")
    .bind(token, userId, new Date(now).toISOString(), new Date(now + SESSION_DAYS * 86_400_000).toISOString())
    .run();
  return token;
}

const credSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(200),
  displayName: z.string().max(40).optional(),
});

// POST /api/auth/signup — 이메일+비번, 현재 익명 uid를 계정에 귀속
authRouter.post("/signup", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const parsed = credSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input", hint: "이메일/8자 이상 비밀번호" }, 400);
  const email = parsed.data.email.toLowerCase().trim();
  const uid = uidOf(c) ?? `u_${randHex(11)}`;

  const exists = await db.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if (exists) return c.json({ error: "email_taken" }, 409);

  const salt = randHex(16);
  const hash = await hashPw(parsed.data.password, salt);
  const now = new Date().toISOString();
  const res = await db.prepare("INSERT INTO users (email, pw_hash, pw_salt, uid, display_name, created_at, last_login_at) VALUES (?,?,?,?,?,?,?)")
    .bind(email, hash, salt, uid, parsed.data.displayName ?? null, now, now).run();
  const userId = Number(res.meta.last_row_id);
  const token = await createSession(db, userId);
  return c.json({ token, uid, email, displayName: parsed.data.displayName ?? null });
});

// POST /api/auth/login
authRouter.post("/login", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const parsed = credSchema.pick({ email: true, password: true }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const email = parsed.data.email.toLowerCase().trim();
  const user = await db.prepare("SELECT id, pw_hash, pw_salt, uid, display_name FROM users WHERE email=?")
    .bind(email).first<{ id: number; pw_hash: string; pw_salt: string; uid: string; display_name: string | null }>();
  if (!user) return c.json({ error: "invalid_credentials" }, 401);
  const hash = await hashPw(parsed.data.password, user.pw_salt);
  if (!safeEq(hash, user.pw_hash)) return c.json({ error: "invalid_credentials" }, 401);
  await db.prepare("UPDATE users SET last_login_at=? WHERE id=?").bind(new Date().toISOString(), user.id).run();
  const token = await createSession(db, user.id);
  return c.json({ token, uid: user.uid, email, displayName: user.display_name });
});

// GET /api/auth/me — 세션 토큰 검증
authRouter.get("/me", async (c) => {
  const db = c.env.ARCHIVE_DB;
  const token = bearer(c);
  if (!db || !token) return c.json({ user: null });
  const row = await db.prepare(
    `SELECT u.email, u.uid, u.display_name FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token=? AND s.expires_at > ?`)
    .bind(token, new Date().toISOString())
    .first<{ email: string; uid: string; display_name: string | null }>();
  if (!row) return c.json({ user: null });
  return c.json({ user: { email: row.email, uid: row.uid, displayName: row.display_name } });
});

// POST /api/auth/logout
authRouter.post("/logout", async (c) => {
  const db = c.env.ARCHIVE_DB;
  const token = bearer(c);
  if (db && token) await db.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
  return c.json({ ok: true });
});
