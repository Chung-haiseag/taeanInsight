// Hono 인증 미들웨어 — Authorization Bearer 토큰 검증
// PRD v1.8 §6 REQ-PLATFORM-002

import type { MiddlewareHandler } from "hono";

import { verifyJwt, type JwtPayload } from "./jwt";

export type AuthVariables = {
  auth: JwtPayload;
};

export function requireAuth(secretGetter: (env: unknown) => string): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header || !header.toLowerCase().startsWith("bearer ")) {
      return c.json({ error: "unauthorized", reason: "missing_bearer_token" }, 401);
    }
    const token = header.slice(7).trim();
    const payload = await verifyJwt(token, secretGetter(c.env));
    if (!payload || payload.type !== "access") {
      return c.json({ error: "unauthorized", reason: "invalid_or_expired_token" }, 401);
    }
    c.set("auth", payload);
    await next();
  };
}

/**
 * 신원 확인(완화형) — 로그인 JWT가 있으면 그 사용자, 없으면 익명 디바이스 uid(X-Taean-Uid)로 식별.
 * 초개인화 선호도 저장/조회를 비로그인 데모에서도 동작시키되, 둘 다 없으면 401.
 * (익명 uid는 디바이스 범위 — 나중에 로그인 계정으로 승격 가능)
 */
export function identifyUser(secretGetter: (env: unknown) => string): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    if (header && header.toLowerCase().startsWith("bearer ")) {
      const payload = await verifyJwt(header.slice(7).trim(), secretGetter(c.env));
      if (payload && payload.type === "access") {
        c.set("auth", payload);
        return next();
      }
    }
    const anon = c.req.header("X-Taean-Uid");
    if (anon && /^[A-Za-z0-9_-]{8,64}$/.test(anon)) {
      const now = Math.floor(Date.now() / 1000);
      c.set("auth", { sub: anon, role: "b2c_basic", iat: now, exp: now + 3600, type: "access" });
      return next();
    }
    return c.json({ error: "unauthorized", reason: "no_identity" }, 401);
  };
}

/**
 * 역할 기반 가드 — 명시된 역할 중 하나여야 통과.
 * 사용: requireRole(["b2b_basic", "b2b_premium", "b2g"])
 */
export function requireRole(allowed: string[]): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth || !allowed.includes(auth.role)) {
      return c.json({ error: "forbidden", reason: "role_not_allowed", required: allowed }, 403);
    }
    await next();
  };
}
