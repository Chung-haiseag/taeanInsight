// 공개 Web Push 구독 라우터 — 로그인 없이 옵트인(뉴스레터형 푸시). /api/push
//   POST /api/push/subscribe    { endpoint, keys:{p256dh, auth} }
//   POST /api/push/unsubscribe  { endpoint }
// 주간 리포트 등은 전 구독자에게 발송하므로 익명 옵트인 허용. 로그인 사용자 연결은 /api/me/push.

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import { D1WebPushSubscriptionRepo } from "./repo_d1";
import { WebCryptoWebPushDispatcher, vapidFromEnv } from "./dispatcher";
import { broadcast } from "./web_push";

export const pushRouter = new Hono<{ Bindings: Env }>();

// 클라이언트가 구독에 필요한 공개 정보(VAPID 공개키) 제공
pushRouter.get("/key", (c) => {
  return c.json({ vapidPublicKey: c.env.VAPID_PUBLIC_KEY ?? null, enabled: !!vapidFromEnv(c.env) });
});

const subSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

pushRouter.post("/subscribe", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const parsed = subSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  const repo = new D1WebPushSubscriptionRepo(c.env.ARCHIVE_DB);
  await repo.add({
    userId: "anon",
    endpoint: parsed.data.endpoint,
    p256dhKey: parsed.data.keys.p256dh,
    authKey: parsed.data.keys.auth,
    enabled: true,
    createdAt: new Date().toISOString(),
  });
  return c.json({ ok: true });
});

// 발송 검증용 — 현재 전 구독자에게 테스트 푸시(옵트인 후 도달 확인)
pushRouter.post("/test", async (c) => {
  const vapid = vapidFromEnv(c.env);
  if (!vapid || !c.env.ARCHIVE_DB) return c.json({ error: "push_unconfigured" }, 503);
  const repo = new D1WebPushSubscriptionRepo(c.env.ARCHIVE_DB);
  const subs = await repo.listAllEnabled();
  if (!subs.length) return c.json({ ok: true, eligible: 0, sent: 0, message: "구독자 없음" });
  const dispatcher = new WebCryptoWebPushDispatcher(vapid);
  const r = await broadcast(dispatcher, subs, { title: "태안 인사이트", body: "푸시 알림이 정상 동작합니다 ✅", url: "/reports", tag: "test" }, repo);
  return c.json({ ok: true, eligible: subs.length, ...r });
});

pushRouter.post("/unsubscribe", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const body = (await c.req.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) return c.json({ error: "invalid_input" }, 400);
  const repo = new D1WebPushSubscriptionRepo(c.env.ARCHIVE_DB);
  await repo.disable("anon", body.endpoint);
  return c.json({ ok: true });
});
