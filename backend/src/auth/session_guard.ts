// 세션 기반 역할 인증 — 웹 회원(불투명 세션 토큰)용. JWT 미들웨어와 별개.
//   sessions JOIN users 로 role 조회. adminGuard 브리지·회원 등급 가드에서 재사용.

import type { MiddlewareHandler } from "hono";

import type { Env } from "../types";
import { hasRole, type Role } from "./roles";

export interface SessionUser {
  id: number;
  uid: string;
  email: string;
  role: string;
  plan: string;
}

// Authorization: Bearer <토큰> 추출(대소문자 무관). 없으면 null.
export function bearerToken(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const h = c.req.header("Authorization");
  return h && h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

// 만료 전 세션의 사용자(role·plan 포함). 토큰/DB 없으면 null.
export async function sessionUser(db: D1Database | undefined, token: string | null): Promise<SessionUser | null> {
  if (!db || !token) return null;
  const row = await db
    .prepare(
      "SELECT u.id, u.uid, u.email, u.role, u.plan FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at > ?",
    )
    .bind(token, new Date().toISOString())
    .first<SessionUser>();
  return row ?? null;
}

// adminGuard 순수 판정: 세션 admin+ 또는 X-Admin-Token 일치면 통과.
export function adminGuardDecision(
  su: SessionUser | null,
  xAdminToken: string | undefined,
  expected: string | undefined,
): "pass" | "unauthorized" | "not_configured" {
  if (su && hasRole(su.role, "admin")) return "pass";
  if (!expected) return "not_configured";
  return xAdminToken === expected ? "pass" : "unauthorized";
}

// 요청자 실효 등급: 세션 role 우선, 없고 토큰OK면 superadmin(루트 비상권), 아니면 user.
export function deriveRequesterRole(su: SessionUser | null, tokenOk: boolean): string {
  if (su) return su.role;
  return tokenOk ? "superadmin" : "user";
}

// 관리자 보호 — 세션 role이 admin 이상이거나 X-Admin-Token 일치면 통과.
//   ADMIN_TOKEN은 스크립트·크론·비상용 폴백으로 유지(미설정이면 503 잠금).
export const adminGuard = async (
  c: {
    req: { method: string; header: (k: string) => string | undefined };
    env: Env;
    json: (b: unknown, s?: number) => Response;
  },
  next: () => Promise<void>,
) => {
  if (c.req.method === "OPTIONS") return next();
  const su = await sessionUser(c.env.ARCHIVE_DB, bearerToken(c));
  const decision = adminGuardDecision(su, c.req.header("X-Admin-Token"), c.env.ADMIN_TOKEN);
  if (decision === "pass") return next();
  if (decision === "not_configured")
    return c.json({ error: "admin_not_configured", hint: "Set ADMIN_TOKEN secret" }, 503);
  return c.json({ error: "unauthorized" }, 401);
};

// 세션 minRole 이상 가드(웹 회원용 미들웨어). 통과 시 c.set("sessionUser", …).
export function requireSessionRole(
  minRole: Role,
): MiddlewareHandler<{ Bindings: { ARCHIVE_DB?: D1Database }; Variables: { sessionUser: SessionUser } }> {
  return async (c, next) => {
    const u = await sessionUser(c.env.ARCHIVE_DB, bearerToken(c));
    if (!u) return c.json({ error: "unauthorized", reason: "no_session" }, 401);
    if (!hasRole(u.role, minRole)) return c.json({ error: "forbidden", required: minRole }, 403);
    c.set("sessionUser", u);
    await next();
  };
}
