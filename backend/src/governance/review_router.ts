// HITL 검수 큐 HTTP API — 관리자 대시보드(/admin)가 호출.
// 큐 조회 + 항목 상세 + 승인/반려 결정.
//
// ⚠️ PoC: 본 라우터는 데모를 위해 공개 상태다. 운영 전 반드시 아래를 적용할 것:
//   reviewRouter.use("*", requireAuth(...));
//   reviewRouter.use("*", requireRole(["editor", "admin"]));
// (cost 라우터와 동일하게 현재 PoC는 인증 미적용)

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import { reviewService as svc, type ReviewStatus } from "./review_queue";

const STATUS_VALUES = ["pending", "approved", "rejected"] as const;

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewerId: z.string().min(1).optional(), // 운영 시 auth.sub 사용
  reason: z.string().max(500).optional(),
});

export const reviewRouter = new Hono<{ Bindings: Env }>();

// 큐 목록 (?status=pending|approved|rejected) + 통계
reviewRouter.get("/", (c) => {
  const status = c.req.query("status");
  const filter = STATUS_VALUES.includes(status as ReviewStatus) ? (status as ReviewStatus) : undefined;
  return c.json({ items: svc.list(filter), stats: svc.stats() });
});

// 항목 상세
reviewRouter.get("/:id", (c) => {
  const item = svc.get(c.req.param("id"));
  if (!item) return c.json({ error: "not_found" }, 404);
  return c.json(item);
});

// 승인/반려 결정
reviewRouter.post("/:id/decision", async (c) => {
  const parsed = decisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  }
  const updated = svc.decide(c.req.param("id"), {
    decision: parsed.data.decision,
    reviewerId: parsed.data.reviewerId ?? "demo-editor", // 운영: c.get("auth").sub
    reason: parsed.data.reason,
  });
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true, item: updated });
});
