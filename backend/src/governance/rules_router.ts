// 민감주제 규칙 관리 HTTP API — 관리자 대시보드(/admin)가 호출.
// 편집팀이 규칙을 활성/비활성·플래그·키워드를 수정하고, 임의 텍스트로 분류를 테스트한다.
// PoC: DEFAULT_RULES 기반 인메모리 store(+enabled). DB(sensitive_topic_rules) 연결 시 교체.
//
// ⚠️ PoC: 데모 위해 공개. 운영 전 requireAuth + requireRole(["editor","admin"]) 적용 필수.
// TaskMaster #27 (AI 거버넌스)

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import {
  DEFAULT_RULES,
  classifySensitiveTopics,
  type SensitiveTopic,
  type TopicRule,
} from "./sensitive_topics";

export interface ManagedRule extends TopicRule {
  enabled: boolean;
}

// 모듈 전역 인메모리 store (enabled 기본 true)
const rules: ManagedRule[] = DEFAULT_RULES.map((r) => ({ ...r, enabled: true }));

function activeRules(): TopicRule[] {
  return rules.filter((r) => r.enabled);
}

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  requiresHitl: z.boolean().optional(),
  blockAiOnly: z.boolean().optional(),
  keywords: z.array(z.string().min(1)).optional(),
});

export const rulesRouter = new Hono<{ Bindings: Env }>();

// 규칙 목록
rulesRouter.get("/", (c) => c.json({ rules }));

// 규칙 수정 (활성/플래그/키워드)
rulesRouter.patch("/:topic", async (c) => {
  const topic = c.req.param("topic") as SensitiveTopic;
  const rule = rules.find((r) => r.topic === topic);
  if (!rule) return c.json({ error: "unknown_topic" }, 404);

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  }
  const { enabled, requiresHitl, blockAiOnly, keywords } = parsed.data;
  if (enabled !== undefined) rule.enabled = enabled;
  if (requiresHitl !== undefined) rule.requiresHitl = requiresHitl;
  if (blockAiOnly !== undefined) rule.blockAiOnly = blockAiOnly;
  if (keywords !== undefined) rule.keywords = keywords;

  return c.json({ ok: true, rule });
});

// 분류 테스트 — 임의 텍스트가 현재 활성 규칙에 어떻게 걸리는지 확인
rulesRouter.post("/classify-test", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return c.json({ error: "empty_text" }, 400);

  const result = classifySensitiveTopics(text, activeRules());
  return c.json({
    requiresHitl: result.requiresHitl,
    blockAiOnly: result.blockAiOnly,
    matches: result.topics.map((t) => ({ topic: t.topic, matchedKeywords: t.matchedKeywords })),
  });
});
