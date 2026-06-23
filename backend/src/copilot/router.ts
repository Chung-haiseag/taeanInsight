// 시민 코파일럿 API — 작성 중 실시간 거버넌스 점검 + 제출→HITL 검수 큐.
// 안전·점검 레이어는 무LLM(규칙/검색)으로 동작. 글쓰기 보조(다듬기/요약)는 추후 Workers AI/Claude.
// 기존 자산 재사용: governance(pii·sensitive·ai_label·middleware) + review_queue(HITL).
// TaskMaster #25(코파일럿) / #26(HITL) / #27(거버넌스)

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import { detectPii } from "../governance/pii";
import { classifySensitiveTopics } from "../governance/sensitive_topics";
import { applyGovernance } from "../governance/middleware";
import { AI_LABEL_TEXT, type AiLabel } from "../governance/ai_label";
import { reviewService, nextReviewId, type ReviewItem } from "../governance/review_queue";

export const copilotRouter = new Hono<{ Bindings: Env }>();

// ── 실시간 점검 (무LLM) — 입력하면 PII·민감주제 경고 ────────
copilotRouter.post("/check", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text : "";
  const title = typeof body?.title === "string" ? body.title : "";
  const full = `${title}\n${text}`;

  const pii = detectPii(full);
  const sensitive = classifySensitiveTopics(full);

  return c.json({
    chars: text.length,
    pii: {
      count: pii.findings.length,
      kinds: [...new Set(pii.findings.map((f) => f.kind))],
      maskedPreview: pii.findings.length ? pii.masked.slice(0, 240) : null,
    },
    sensitive: {
      topics: sensitive.topics.map((t) => ({ topic: t.topic, matched: t.matchedKeywords })),
      requiresHitl: sensitive.requiresHitl,
      blockAiOnly: sensitive.blockAiOnly,
    },
    // 즉시 보여줄 경고 문구
    warnings: [
      ...pii.findings.length ? [`개인정보 ${pii.findings.length}건 감지 — 발행 시 자동 마스킹됩니다`] : [],
      ...sensitive.blockAiOnly ? ["민감 주제 — AI 단독 발행 차단(편집장 직접 작성 필요)"] : [],
      ...sensitive.requiresHitl && !sensitive.blockAiOnly ? ["민감 주제 — 편집부 검토(HITL) 필수"] : [],
    ],
  });
});

// ── AI 글쓰기 보조 (Workers AI 오픈모델 — 무료 할당 내 종량 0) ──
// llama-3.1-8b-instruct는 2026-05-30 폐기 → 현행 고속 모델로 교체
const ASSIST_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const ASSIST_PROMPTS: Record<string, string> = {
  polish: "다음 한국어 기사 문장을 사실은 바꾸지 말고 자연스럽고 명확하게 다듬어줘. 결과만 출력해.",
  summarize: "다음 한국어 기사를 핵심 3줄로 요약해줘. 불릿으로.",
  title: "다음 한국어 기사에 어울리는 신문 제목 3개를 제안해줘. 각 줄에 하나씩.",
};

copilotRouter.post("/assist", async (c) => {
  if (!c.env.AI) return c.json({ error: "ai_unbound", message: "Workers AI 바인딩이 없습니다" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const mode = typeof body?.mode === "string" ? body.mode : "";
  const text = typeof body?.text === "string" ? body.text : "";
  const system = ASSIST_PROMPTS[mode];
  if (!system) return c.json({ error: "invalid_mode" }, 400);
  if (!text.trim()) return c.json({ error: "empty_text" }, 400);

  try {
    const res = (await c.env.AI.run(ASSIST_MODEL as never, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: text.slice(0, 4000) },
      ],
      max_tokens: 512,
    } as never)) as { response?: string };
    return c.json({ mode, model: ASSIST_MODEL, result: (res.response ?? "").trim() });
  } catch (e) {
    return c.json({ error: "assist_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ── 키워드 → 기사 초안 생성 (Workers AI) — 시민기자가 수정하는 출발점 ──
// 뉴스 날조 방지: 구체 사실(수치·날짜·이름·인용)은 지어내지 말고 [확인 필요] 마커로.
const DRAFT_SYSTEM = `너는 충남 태안 지역신문의 기사 초안 보조작가다. 기자가 준 키워드로 한국어 기사 '초안 골격'을 쓴다.
엄격한 규칙:
- 반드시 한국어만 사용한다(외국어·한자 혼용 금지).
- 절대 사실을 지어내지 마라: 수치·날짜·인명·기관명·통계는 모르면 [확인 필요: 무엇] 자리표시로 남긴다.
- 인용(따옴표)은 절대 창작하지 마라. "관계자는 …라고 말했다" 같은 가짜 발언 금지. 인용이 필요하면 [관계자 인용 확인 필요]로만 표기한다.
- 확인되지 않은 내용을 단정하지 말고, 취재로 채울 부분을 자리표시로 비워둔다.
- 신문체(객관적·간결)로 제목 1개 + 본문(리드 1문단 + 3~4문단 골격)을 쓴다.
- 출력 형식: 첫 줄에 제목만, 그다음 빈 줄, 그다음 본문. 설명·머리말 없이 기사만 출력한다.`;

copilotRouter.post("/draft", async (c) => {
  if (!c.env.AI) return c.json({ error: "ai_unbound" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const keywords = typeof body?.keywords === "string" ? body.keywords.trim() : "";
  if (!keywords) return c.json({ error: "empty_keywords" }, 400);

  try {
    const res = (await c.env.AI.run(ASSIST_MODEL as never, {
      messages: [
        { role: "system", content: DRAFT_SYSTEM },
        { role: "user", content: `키워드: ${keywords.slice(0, 500)}` },
      ],
      max_tokens: 900,
    } as never)) as { response?: string };
    const text = (res.response ?? "").trim();
    const lines = text.split("\n");
    let titleLine = (lines.shift() ?? "").replace(/^제목[:：]\s*/, "").replace(/^#+\s*/, "").trim();
    if (titleLine.length > 100) { lines.unshift(titleLine); titleLine = ""; }
    const draftBody = lines.join("\n").trim();
    return c.json({ ok: true, model: ASSIST_MODEL, title: titleLine, body: draftBody || text });
  } catch (e) {
    return c.json({ error: "draft_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ── 제출 → 거버넌스 적용 → AI 라벨 산정 → 검수 큐 등록 ───────
const submitSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  aiLabel: z.enum(["human", "ai_assisted", "ai_generated"]),
  sources: z.array(z.object({ title: z.string(), url: z.string().optional() })).optional(),
  reporterId: z.string().optional(),
});

copilotRouter.post("/submit", async (c) => {
  const parsed = submitSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  }
  const { title, body, aiLabel, sources, reporterId } = parsed.data;

  const gov = applyGovernance({ body, aiLabel: aiLabel as AiLabel, sources: sources ?? [] });

  const item: ReviewItem = {
    id: nextReviewId(),
    resourceType: "article",
    resourceId: reporterId ? `citizen:${reporterId}` : "citizen:anon",
    title,
    excerpt: gov.body.length > 160 ? gov.body.slice(0, 160) + "…" : gov.body,
    aiLabel: gov.forcedAiLabel,
    sensitiveTopics: gov.sensitive.topics.map((t) => t.topic),
    piiKinds: [...new Set(gov.pii.findings.map((f) => f.kind))],
    requiresHitl: gov.sensitive.requiresHitl,
    blockAiOnly: gov.sensitive.blockAiOnly,
    reasons: gov.reasons,
    status: "pending",
    queuedAt: new Date().toISOString(),
  };
  reviewService.enqueue(item);

  return c.json({
    ok: true,
    queued: true,
    reviewId: item.id,
    aiLabel: item.aiLabel,
    aiLabelText: AI_LABEL_TEXT[item.aiLabel],
    publishAllowed: gov.publishGuard.allowed,
    reasons: gov.reasons,
    message: gov.publishGuard.allowed
      ? "검수 큐에 등록되었습니다. 편집부 승인 후 발행됩니다."
      : `발행 보류: ${gov.publishGuard.reason ?? "요건 미충족"} (검수 큐에 등록됨)`,
  });
});
