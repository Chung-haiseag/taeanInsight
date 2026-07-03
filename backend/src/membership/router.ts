// 멤버십 — 사전 신청(수요 검증). 결제(PG) 연동 전, 어떤 플랜에 몇 명이 돈 낼 의사가 있는지 수치로 확보.
//  POST /api/membership/lead   { email, plan, name?, note? }

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";

export const membershipRouter = new Hono<{ Bindings: Env }>();

const leadSchema = z.object({
  email: z.string().email().max(120),
  plan: z.enum(["reader", "business", "org"]),
  name: z.string().max(60).optional(),
  note: z.string().max(200).optional(),
});

membershipRouter.post("/lead", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  // 남용 방어(가입 리밋 재사용)
  const rl = c.env.LOGIN_RL;
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (rl && !(await rl.limit({ key: `lead:${ip}` })).success) return c.json({ error: "rate_limited" }, 429);

  const parsed = leadSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const { email, plan, name, note } = parsed.data;
  try {
    await db.prepare("INSERT INTO subscription_leads (email, plan, name, note, created_at) VALUES (?,?,?,?,?)")
      .bind(email.toLowerCase().trim(), plan, name ?? null, note ?? null, new Date().toISOString()).run();
  } catch {
    return c.json({ ok: true, duplicate: true }); // 이미 신청됨 — 성공으로 응답
  }
  return c.json({ ok: true });
});
