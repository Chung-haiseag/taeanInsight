// Prediction Agent — 관광·환경·부동산 예측 질의 처리
// PRD v1.8 §6 REQ-AI-001 — batch 채널 우선 (Anthropic Claude Haiku Batch, 50% 할인)

import type { CacheStore } from "../cache/key_normalizer";
import { ttlFor } from "../cache/key_normalizer";
import type { HybridLlmRouter } from "../llm/hybrid_router";
import type { AgentContext, AgentNode, NodeResult } from "./types";
import { buildMessages } from "./types";

export interface PredictionAgentDeps {
  llm: HybridLlmRouter;
  cache: CacheStore;
}

const SYSTEM_PROMPT = `당신은 충남 태안 지역 전문가입니다.
관광·환경·부동산 예측 질의에 답할 때 다음을 반드시 지키세요:
1. 모르는 것은 "관련 자료를 찾을 수 없습니다"라고 솔직히 답하세요. 추측 금지.
2. 답변에는 가능하면 출처(태안군청·기상청·해양수산부·국토부 등)를 언급하세요.
3. 정확한 수치를 모를 때는 범위(예: "약 1,500만 명")로 답하세요.
4. 개인정보·민감 주제(선거·범죄·의료·종교)는 답변하지 마세요.`;

export function createPredictionAgent(deps: PredictionAgentDeps): AgentNode {
  return async function predictionAgent(ctx: AgentContext): Promise<NodeResult> {
    const response = await deps.llm.route(
      {
        intent: "prediction",
        channel: "batch",
        messages: buildMessages(SYSTEM_PROMPT, ctx.query),
        maxTokens: 600,
        temperature: 0.1,
        metadata: {
          domain: ctx.domain,
          location: ctx.location,
          userTier: ctx.userTier,
        },
      },
      "normal",
    );

    // 캐시 적재 (TTL: weekly 7일)
    if (ctx.cacheKey) {
      await deps.cache.set(
        ctx.cacheKey,
        { answer: response.content, sources: [] },
        ttlFor("weekly"),
      );
    }

    return {
      next: null,
      patch: {
        answer: response.content,
        llmCalls: (ctx.llmCalls ?? 0) + 1,
        costKrwTotal: (ctx.costKrwTotal ?? 0) + response.costKrw,
        metadata: { ...ctx.metadata, predictionModel: response.model, predictionChannel: response.channel },
      },
    };
  };
}
