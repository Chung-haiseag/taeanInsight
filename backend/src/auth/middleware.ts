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
