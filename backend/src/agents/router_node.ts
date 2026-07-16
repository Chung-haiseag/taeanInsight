// Router 노드 — 사용자 질의를 intent로 분류 + 캐시 조회
// PRD v1.8 §6 REQ-AI-001 분류 정확도 ≥ 85% 목표

import type { CacheStore } from "../cache/key_normalizer";
import { buildCacheKey } from "../cache/key_normalizer";
import type { LlmIntent } from "../llm/types";
import type { AgentContext, AgentNode, NodeResult } from "./types";

// 키워드 기반 1차 분류 — 빠르고 LLM 호출 없이 끝남.
// PRD §6 REQ-AI-001 "실시간 Multi-Agent 호출 횟수 최소화" 정신.
interface IntentRule {
  intent: LlmIntent;
  patterns: RegExp[];
}

// 순서 주의: factcheck를 prediction보다 먼저 검사한다. 구체적인 과거-사실 패턴
// (예: "언제 생겼")이 prediction의 일반 "언제"에 가려지지 않도록. 둘 다 prediction_agent로
// 라우팅되므로 라우팅에는 영향이 없고, intent 라벨·캐시 timeWindow만 정확해진다.
const INTENT_RULES: IntentRule[] = [
  {
    intent: "factcheck",
    patterns: [
      /사실인가/, /정말/, /확인/, /맞나/, /진짜/,
      /언제 ?(생|발생|발견|만들|시작)/, /어디/, /몇 ?살/, /누구/,
    ],
  },
  {
    intent: "prediction",
    patterns: [
      /다음 ?주/, /이번 ?주말/, /내일/, /예측/, /예보/, /전망/, /추세/,
      /얼마나 ?(올|많|혼잡)/, /몇 ?명/, /언제/, /시세/,
    ],
  },
  {
    intent: "generation",
    patterns: [
      /요약/, /다듬어/, /정리해/, /고쳐/, /제목/, /설명해/, /써줘/, /번역/,
    ],
  },
];

export interface RouterNodeDeps {
  cache: CacheStore;
}

export function createRouterNode(deps: RouterNodeDeps): AgentNode {
  return async function routerNode(ctx: AgentContext): Promise<NodeResult> {
    // 1) 키워드 분류
    const classified = classifyByKeywords(ctx.query);
    const intent = classified.intent;
    const confidence = classified.confidence;

    // 2) 캐시 키 생성
    const cacheKey = await buildCacheKey(ctx.query, {
      domain: ctx.domain,
      location: ctx.location,
      timeWindow: intent === "prediction" ? "weekly" : "current",
      userTier: ctx.userTier,
    });

    // 3) 캐시 조회 — 히트면 즉시 종료, LLM 호출 0회
    const cached = await deps.cache.get<{ answer: string; sources: import("./types").SourceCitation[] }>(cacheKey);
    if (cached) {
      return {
        next: null,
        patch: {
          intent,
          confidence,
          cacheKey,
          fromCache: true,
          answer: cached.answer,
          sources: cached.sources,
          llmCalls: 0,
        },
      };
    }

    // 4) 캐시 미스 — intent에 따라 다음 노드로 라우팅
    const next =
      intent === "prediction" || intent === "factcheck"
        ? "prediction_agent"
        : intent === "generation"
        ? "generation_agent"
        : "generation_agent";    // intent="other"는 generation으로 폴백

    return {
      next,
      patch: { intent, confidence, cacheKey, fromCache: false },
    };
  };
}

function classifyByKeywords(query: string): { intent: LlmIntent; confidence: number } {
  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((p) => p.test(query))) {
      return { intent: rule.intent, confidence: 0.8 };
    }
  }
  return { intent: "other", confidence: 0.4 };
}

// LLM 기반 보조 분류기 (낮은 confidence일 때만 사용 — 호출 비용 절약)
// 미래 확장: rerouter 노드에서 호출
export { classifyByKeywords };
