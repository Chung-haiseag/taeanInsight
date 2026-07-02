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

// 세션 토큰 → 사용자 조회(계정 관리 공용)
async function userFromToken(db: D1Database, token: string | null) {
  if (!token) return null;
  return db.prepare(
    "SELECT u.id, u.email, u.uid, u.display_name, u.pw_hash, u.pw_salt, u.provider FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at > ?")
    .bind(token, new Date().toISOString())
    .first<{ id: number; email: string; uid: string; display_name: string | null; pw_hash: string; pw_salt: string; provider: string }>();
}

// POST /api/auth/profile — 표시 이름 변경
authRouter.post("/profile", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const user = await userFromToken(db, bearer(c));
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({})) as { displayName?: string };
  const name = (body.displayName ?? "").trim().slice(0, 40);
  await db.prepare("UPDATE users SET display_name=? WHERE id=?").bind(name || null, user.id).run();
  return c.json({ ok: true, displayName: name || null });
});

// POST /api/auth/change-password — 현재 비번 확인 후 변경(이메일 계정만)
authRouter.post("/change-password", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const user = await userFromToken(db, bearer(c));
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (user.provider !== "email" || !user.pw_hash) return c.json({ error: "social_account", hint: "소셜 로그인 계정은 비밀번호가 없습니다" }, 400);
  const body = await c.req.json().catch(() => ({})) as { currentPassword?: string; newPassword?: string };
  if (!body.currentPassword || !body.newPassword || body.newPassword.length < 8) return c.json({ error: "invalid_input" }, 400);
  const cur = await hashPw(body.currentPassword, user.pw_salt);
  if (!safeEq(cur, user.pw_hash)) return c.json({ error: "invalid_credentials" }, 401);
  const salt = randHex(16);
  const hash = await hashPw(body.newPassword, salt);
  await db.prepare("UPDATE users SET pw_hash=?, pw_salt=? WHERE id=?").bind(hash, salt, user.id).run();
  // 다른 세션 무효화(현재 토큰 제외)
  await db.prepare("DELETE FROM sessions WHERE user_id=? AND token<>?").bind(user.id, bearer(c)).run();
  return c.json({ ok: true });
});

// POST /api/auth/delete — 계정 삭제(이메일 계정은 비번 확인)
authRouter.post("/delete", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const user = await userFromToken(db, bearer(c));
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (user.provider === "email" && user.pw_hash) {
    const body = await c.req.json().catch(() => ({})) as { password?: string };
    const h = await hashPw(body.password ?? "", user.pw_salt);
    if (!safeEq(h, user.pw_hash)) return c.json({ error: "invalid_credentials" }, 401);
  }
  await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id).run();
  await db.prepare("DELETE FROM users WHERE id=?").bind(user.id).run();
  return c.json({ ok: true });
});

// ── 카카오 로그인(OAuth) ────────────────────────────────
const KAKAO_CB = "https://taean-insight-api.chs9182.workers.dev/api/auth/kakao/callback";
// 세션 토큰이 리다이렉트로 전달되므로 신뢰 호스트로만 — 오픈 리다이렉트(계정 탈취) 방지
const REDIRECT_HOSTS = new Set(["insight.taeannews.co.kr", "taean-insight.chs9182.workers.dev"]);
function safeRedirect(url: string | undefined): string {
  const fallback = "https://insight.taeannews.co.kr/login";
  try { return REDIRECT_HOSTS.has(new URL(url ?? "").hostname) ? url! : fallback; } catch { return fallback; }
}

// GET /api/auth/kakao/start?redirect=<프론트 콜백>&uid=<익명uid> — 카카오 인증으로 리다이렉트
authRouter.get("/kakao/start", async (c) => {
  const key = (c.env as Env & { KAKAO_REST_KEY?: string }).KAKAO_REST_KEY;
  if (!key) return c.json({ error: "kakao_not_configured", hint: "KAKAO_REST_KEY 시크릿 설정" }, 503);
  const redirect = safeRedirect(c.req.query("redirect"));
  const uid = c.req.query("uid") || "";
  const state = btoa(JSON.stringify({ redirect, uid })).replace(/=+$/, "");
  const url = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${key}&redirect_uri=${encodeURIComponent(KAKAO_CB)}&state=${encodeURIComponent(state)}&scope=profile_nickname,account_email`;
  return c.redirect(url, 302);
});

// GET /api/auth/kakao/callback?code=&state= — 토큰교환→프로필→계정 생성/로그인→프론트로 토큰 전달
authRouter.get("/kakao/callback", async (c) => {
  const db = c.env.ARCHIVE_DB;
  const key = (c.env as Env & { KAKAO_REST_KEY?: string }).KAKAO_REST_KEY;
  if (!db || !key) return c.text("unconfigured", 503);
  const code = c.req.query("code");
  let redirect = "https://insight.taeannews.co.kr/login", uid = "";
  try { const st = JSON.parse(atob(c.req.query("state") || "")); redirect = safeRedirect(st.redirect); uid = st.uid || ""; } catch { /* */ }
  if (!code) return c.redirect(`${redirect}?error=kakao_denied`, 302);

  try {
    // 1) code → access token
    const tokRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: key, redirect_uri: KAKAO_CB, code }),
    });
    const tok = await tokRes.json() as { access_token?: string };
    if (!tok.access_token) return c.redirect(`${redirect}?error=kakao_token`, 302);

    // 2) 프로필
    const meRes = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const me = await meRes.json() as { id?: number; kakao_account?: { email?: string; profile?: { nickname?: string } } };
    if (!me.id) return c.redirect(`${redirect}?error=kakao_profile`, 302);
    const kakaoId = String(me.id);
    const email = me.kakao_account?.email?.toLowerCase() || `kakao_${kakaoId}@kakao.local`;
    const nick = me.kakao_account?.profile?.nickname || "카카오 사용자";

    // 3) 계정 조회(provider_id) / 생성
    let user = await db.prepare("SELECT id, uid FROM users WHERE provider='kakao' AND provider_id=?").bind(kakaoId).first<{ id: number; uid: string }>();
    if (!user) {
      const existingUid = /^[A-Za-z0-9_-]{8,64}$/.test(uid) ? uid : `u_${randHex(11)}`;
      const now = new Date().toISOString();
      const res = await db.prepare(
        "INSERT INTO users (email, pw_hash, pw_salt, uid, display_name, provider, provider_id, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(email, "", "", existingUid, nick, "kakao", kakaoId, now, now).run();
      user = { id: Number(res.meta.last_row_id), uid: existingUid };
    } else {
      await db.prepare("UPDATE users SET last_login_at=? WHERE id=?").bind(new Date().toISOString(), user.id).run();
    }
    const token = await createSession(db, user.id);
    // 4) 프론트로 토큰 전달(쿼리) — 프론트가 저장 후 정리
    return c.redirect(`${redirect}?kakao_token=${token}&uid=${user.uid}`, 302);
  } catch {
    return c.redirect(`${redirect}?error=kakao_failed`, 302);
  }
});

// POST /api/auth/logout
authRouter.post("/logout", async (c) => {
  const db = c.env.ARCHIVE_DB;
  const token = bearer(c);
  if (db && token) await db.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
  return c.json({ ok: true });
});
