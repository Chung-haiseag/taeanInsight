// 이메일 뉴스레터 구독 — 수집(동의)·해지. 발송수단은 추후 결정(도메인 온보딩 필요).
//   POST /api/email/subscribe { email }   공개 구독
//   GET  /api/email/unsubscribe?token=...  1클릭 해지(법적 필수)
// 발송 전이라도 수신자 수집은 가능 — 어떤 발송 방식에도 재사용.

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";

export const emailRouter = new Hono<{ Bindings: Env }>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const subscribeSchema = z.object({ email: z.string().trim().toLowerCase().regex(EMAIL_RE), source: z.string().max(40).optional() });

function token(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

emailRouter.post("/subscribe", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const parsed = subscribeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_email" }, 400);
  const { email, source } = parsed.data;
  const now = new Date().toISOString();
  // 재구독 시 active로 복구, 토큰 유지(있으면)
  await c.env.ARCHIVE_DB
    .prepare(
      `INSERT INTO email_subscribers (email, token, status, source, created_at, updated_at)
       VALUES (?1, ?2, 'active', ?3, ?4, ?4)
       ON CONFLICT(email) DO UPDATE SET status='active', updated_at=?4`,
    )
    .bind(email, token(), source ?? "reports", now)
    .run();
  return c.json({ ok: true });
});

emailRouter.get("/unsubscribe", async (c) => {
  const t = c.req.query("token");
  const html = (msg: string) =>
    c.html(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><div style="font-family:system-ui;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center;color:#2a2118"><h2>태안 인사이트</h2><p>${msg}</p><a href="https://insight.taeannews.co.kr" style="color:#b8860b">홈으로</a></div>`);
  if (!t || !c.env.ARCHIVE_DB) return html("잘못된 요청입니다.");
  const r = await c.env.ARCHIVE_DB
    .prepare(`UPDATE email_subscribers SET status='unsubscribed', updated_at=?2 WHERE token=?1`)
    .bind(t, new Date().toISOString())
    .run();
  return html(r.meta.changes ? "구독이 해지되었습니다. 그동안 이용해 주셔서 감사합니다." : "이미 해지되었거나 유효하지 않은 링크입니다.");
});
