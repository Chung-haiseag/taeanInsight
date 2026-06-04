// 부가상품(add-on) HTTP API — 카탈로그 조회 + 구독/해지 + 내 권한 조회
// 별도 과금: 초개인화 홈 등 add-on을 기존 구독과 독립적으로 결제한다.

import { Hono } from "hono";

import type { Env } from "../types";
import { requireAuth, type AuthVariables } from "../auth/middleware";
import { AddonService, InMemoryAddonStore, getAddon } from "./addons";

// 모듈 전역 인메모리 store — DB 연결 시 교체
const store = new InMemoryAddonStore();
const svc = new AddonService(store);

export const addonsRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// 카탈로그는 비로그인도 조회 가능(가격·혜택 노출 → 업셀)
addonsRouter.get("/", (c) => c.json({ addons: svc.catalog() }));

// 이하 인증 필요
addonsRouter.use("/me", requireAuth((env) => (env as Env & { JWT_SECRET?: string }).JWT_SECRET ?? "dev-secret"));
addonsRouter.use("/:key/*", requireAuth((env) => (env as Env & { JWT_SECRET?: string }).JWT_SECRET ?? "dev-secret"));

// 내가 보유한 add-on 권한 목록
addonsRouter.get("/me", (c) => {
  const userId = c.get("auth").sub;
  return c.json({ entitlements: svc.entitlements(userId) });
});

// 구독(결제) — 실제 Toss 빌링 연동 지점. 현재 PoC는 entitlement만 활성화.
addonsRouter.post("/:key/subscribe", (c) => {
  const product = getAddon(c.req.param("key"));
  if (!product) return c.json({ error: "unknown_addon" }, 404);
  const userId = c.get("auth").sub;
  // TODO: SubscriptionService/toss.ts 로 product.priceKrw 청구 후 성공 시 활성화
  const ent = svc.subscribe(userId, product.key);
  return c.json({ ok: true, entitlement: ent, charged: product.priceKrw });
});

// 해지
addonsRouter.post("/:key/cancel", (c) => {
  const product = getAddon(c.req.param("key"));
  if (!product) return c.json({ error: "unknown_addon" }, 404);
  const userId = c.get("auth").sub;
  const ent = svc.cancel(userId, product.key);
  if (!ent) return c.json({ error: "not_subscribed" }, 404);
  return c.json({ ok: true, entitlement: ent });
});
