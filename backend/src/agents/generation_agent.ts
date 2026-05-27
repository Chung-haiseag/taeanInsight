// Generation Agent — 요약·다듬기·제목·일반 응답
// PRD v1.8 §6 REQ-AI-001 — realtime 채널 (Together AI Solar Mini)

import type { CacheStore } from "../cache/key_normalizer";
import { ttlFor } from "../cache/key_normalizer";
import type { HybridLlmRouter } from "../llm/hybrid_router";
import type { AgentContext, AgentNode, NodeResult } from "./types";
import { buildMessages } from "./types";

export interface GenerationAgentDeps {
  llm: HybridLlmRouter;
  cache: CacheStore;
}

const SYSTEM_PROMPT = `당신은 충남 태안 지역신문의 친근하고 정확한 AI 보조입니다.
다음 원칙을 지키세요:
1. 한국어로 자연스럽게 답하세요.
2. 사실 확인이 안 된 부분은 추측하지 말고 "정확한 정보가 필요한 부분은 출처를 확인해주세요"라고 안내하세요.
3. 답변은 핵심부터 간결하게 시작하고, 필요하면 부연 설명을 덧붙이세요.
4. 개인정보·민감 주제(선거·범죄·의료·종교·정치인물 평가·부동산 투기 자문·소수자 차별)는 답변하지 마세요.`;

export function createGenerationAgent(deps: GenerationAgentDeps): AgentNode {
  return async function generationAgent(ctx: AgentContext): Promise<NodeResult> {
    const response = await deps.llm.route(
      {
        intent: "generation",
        channel: "realtime",
        messages: buildMessages(SYSTEM_PROMPT, ctx.query),
        maxTokens: 500,
        temperature: 0.2,
        metadata: {
          domain: ctx.domain,
          location: ctx.location,
          userTier: ctx.userTier,
        },
      },
      "normal",
    );

    if (ctx.cacheKey) {
      await deps.cache.set(
        ctx.cacheKey,
        { answer: response.content, sources: [] },
        ttlFor("daily"),
      );
    }

    return {
      next: null,
      patch: {
        answer: response.content,
        llmCalls: (ctx.llmCalls ?? 0) + 1,
        costKrwTotal: (ctx.costKrwTotal ?? 0) + response.costKrw,
        metadata: { ...ctx.metadata, generationModel: response.model, generationChannel: response.channel },
      },
    };
  };
}
