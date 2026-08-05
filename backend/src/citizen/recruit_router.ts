// 2026 시민기자 공개 모집 — 신문 광고/QR로 유입되는 일반인 지원 접수(비로그인, 공개).
//   POST /api/citizen/recruit  { name, phone?, email?, region?, ageGroup?, interest?, motivation? }
//   멤버십 lead와 동일한 공개·레이트리밋 패턴. 관리자는 /api/admin/citizen/recruit 로 조회.

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";

export const recruitRouter = new Hono<{ Bindings: Env }>();

const schema = z.object({
  name: z.string().min(1).max(40),
  phone: z.string().max(30).optional(),
  email: z.string().max(120).optional(),
  region: z.string().max(20).optional(),
  ageGroup: z.string().max(20).optional(),
  interest: z.string().max(60).optional(),
  motivation: z.string().max(300).optional(),
});

recruitRouter.post("/", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const rl = c.env.LOGIN_RL;
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (rl && !(await rl.limit({ key: `recruit:${ip}` })).success) return c.json({ error: "rate_limited" }, 429);

  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const d = parsed.data;
  if (!d.phone && !d.email) return c.json({ error: "no_contact" }, 400); // 연락 수단 최소 1개

  await db.prepare(
    `INSERT INTO citizen_recruit (name, phone, email, region, age_group, interest, motivation, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).bind(
    d.name.trim(), d.phone?.trim() ?? null, d.email?.trim().toLowerCase() ?? null,
    d.region ?? null, d.ageGroup ?? null, d.interest?.trim() ?? null, d.motivation?.trim() ?? null,
    new Date().toISOString(),
  ).run();
  return c.json({ ok: true });
});
