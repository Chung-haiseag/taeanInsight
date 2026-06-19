// /me 초개인화 페이지 HTTP API
// PRD v1.8 §6 REQ-PRODUCT-005

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import { identifyUser, type AuthVariables } from "../auth/middleware";
import {
  InMemoryFavoritesRepo,
  InMemoryPreferencesRepo,
  InMemoryB2gMembershipRepo,
} from "./repository";
import { D1PreferencesRepo, D1FavoritesRepo } from "./repository_d1";
import { LimitExceededError, PreferencesService } from "./service";
import type { UserSegment, InterestCategory, NotificationChannel } from "./types";
import { D1WebPushSubscriptionRepo } from "../notifications/repo_d1";

// 인메모리 폴백(테스트·D1 미바인딩 시)
const prefRepo = new InMemoryPreferencesRepo();
const favRepo = new InMemoryFavoritesRepo();
const b2gRepo = new InMemoryB2gMembershipRepo();
const svc = new PreferencesService(prefRepo, favRepo);

// 요청별 서비스 — ARCHIVE_DB 있으면 D1 영속, 없으면 인메모리
function serviceFor(c: { env: Env }): PreferencesService {
  const db = c.env.ARCHIVE_DB;
  return db ? new PreferencesService(new D1PreferencesRepo(db), new D1FavoritesRepo(db)) : svc;
}

const SEGMENT_VALUES = ["b2c_basic", "b2c_premium", "b2b_basic", "b2b_premium", "b2g"] as const;
const CATEGORY_VALUES = ["tourism", "environment", "realestate", "policy", "industry", "culture"] as const;
const CHANNEL_VALUES = ["email", "webpush", "kakao"] as const;

const onboardSchema = z.object({
  segment: z.enum(SEGMENT_VALUES),
  regions: z.array(z.string()).min(1),
  categories: z.array(z.enum(CATEGORY_VALUES)).min(1),
  notificationChannels: z.array(z.enum(CHANNEL_VALUES)).min(0),
});

const updateSchema = z.object({
  regions: z.array(z.string()).optional(),
  categories: z.array(z.enum(CATEGORY_VALUES)).optional(),
  notificationChannels: z.array(z.enum(CHANNEL_VALUES)).optional(),
});

const addFavoriteSchema = z.object({
  kind: z.enum(["place", "event", "report", "article", "dashboard_widget"]),
  refId: z.string(),
  label: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const meRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

meRouter.use("*", identifyUser((env) => (env as Env & { JWT_SECRET?: string }).JWT_SECRET ?? "dev-secret"));

// GET /api/me — 사용자 선호 + 즐겨찾기 + B2G 소속 + 세그먼트별 한도
meRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const prefs = await serviceFor(c).get(auth.sub);
  if (!prefs) {
    return c.json({ onboarded: false, segment: auth.role });
  }
  const favorites = await serviceFor(c).listFavorites(auth.sub);
  const b2gMemberships = await b2gRepo.listByUser(auth.sub);
  return c.json({
    onboarded: true,
    preferences: prefs,
    favorites,
    b2gMemberships,
  });
});

// POST /api/me/onboarding
meRouter.post("/onboarding", async (c) => {
  const auth = c.get("auth");
  const parsed = onboardSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);

  try {
    const prefs = await serviceFor(c).onboard({
      userId: auth.sub,
      segment: parsed.data.segment as UserSegment,
      regions: parsed.data.regions,
      categories: parsed.data.categories as InterestCategory[],
      notificationChannels: parsed.data.notificationChannels as NotificationChannel[],
    });
    return c.json(prefs);
  } catch (e) {
    if (e instanceof LimitExceededError) {
      return c.json({ error: "limit_exceeded", violations: e.violations }, 422);
    }
    throw e;
  }
});

// PATCH /api/me — 선호 갱신
meRouter.patch("/", async (c) => {
  const auth = c.get("auth");
  const parsed = updateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  try {
    const prefs = await serviceFor(c).update(auth.sub, {
      regions: parsed.data.regions,
      categories: parsed.data.categories as InterestCategory[] | undefined,
      notificationChannels: parsed.data.notificationChannels as NotificationChannel[] | undefined,
    });
    return c.json(prefs);
  } catch (e) {
    if (e instanceof LimitExceededError) {
      return c.json({ error: "limit_exceeded", violations: e.violations }, 422);
    }
    if ((e as Error).message?.includes("not_found")) {
      return c.json({ error: "preferences_not_found", hint: "run_onboarding_first" }, 404);
    }
    throw e;
  }
});

// 즐겨찾기
meRouter.get("/favorites", async (c) => {
  const auth = c.get("auth");
  const favorites = await serviceFor(c).listFavorites(auth.sub);
  return c.json({ favorites });
});

meRouter.post("/favorites", async (c) => {
  const auth = c.get("auth");
  const parsed = addFavoriteSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  try {
    const fav = await serviceFor(c).addFavorite(auth.sub, parsed.data.kind, parsed.data.refId, {
      label: parsed.data.label,
      metadata: parsed.data.metadata,
    });
    return c.json(fav);
  } catch (e) {
    if (e instanceof LimitExceededError) {
      return c.json({ error: "limit_exceeded", violations: e.violations }, 422);
    }
    throw e;
  }
});

meRouter.delete("/favorites/:id", async (c) => {
  const auth = c.get("auth");
  await serviceFor(c).removeFavorite(auth.sub, c.req.param("id"));
  return c.json({ ok: true });
});

// ── Web Push 구독 (W3C 표준) ───────────────────────────────
const pushSubSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// POST /api/me/push — 브라우저 PushSubscription 저장(로그인 사용자에 연결)
meRouter.post("/push", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const parsed = pushSubSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  const auth = c.get("auth");
  const repo = new D1WebPushSubscriptionRepo(c.env.ARCHIVE_DB);
  await repo.add({
    userId: auth.sub,
    endpoint: parsed.data.endpoint,
    p256dhKey: parsed.data.keys.p256dh,
    authKey: parsed.data.keys.auth,
    enabled: true,
    createdAt: new Date().toISOString(),
  });
  return c.json({ ok: true });
});

// DELETE /api/me/push — 구독 해제
meRouter.delete("/push", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const body = await c.req.json().catch(() => ({})) as { endpoint?: string };
  if (!body.endpoint) return c.json({ error: "invalid_input" }, 400);
  const auth = c.get("auth");
  const repo = new D1WebPushSubscriptionRepo(c.env.ARCHIVE_DB);
  await repo.disable(auth.sub, body.endpoint);
  return c.json({ ok: true });
});

// 부트스트랩 — 테스트용 export
export const __test = { svc, prefRepo, favRepo, b2gRepo };
