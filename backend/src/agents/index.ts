// LangGraph Lite 그래프 팩토리 + 단일 진입점
// PRD v1.8 §6 REQ-AI-001

import type { CacheStore } from "../cache/key_normalizer";
import type { HybridLlmRouter } from "../llm/hybrid_router";
import { runGraph } from "./graph";
import { createGenerationAgent } from "./generation_agent";
import { createPredictionAgent } from "./prediction_agent";
import { createRouterNode } from "./router_node";
import type { AgentContext, GraphDefinition } from "./types";

export interface AgentRuntime {
  ask(input: { query: string; userTier?: string; domain?: string; location?: string }): Promise<AgentContext>;
}

export function createAgentGraph(deps: { llm: HybridLlmRouter; cache: CacheStore }): GraphDefinition {
  return {
    entry: "router",
    nodes: {
      router: createRouterNode({ cache: deps.cache }),
      prediction_agent: createPredictionAgent(deps),
      generation_agent: createGenerationAgent(deps),
    },
  };
}

export function createAgentRuntime(deps: { llm: HybridLlmRouter; cache: CacheStore }): AgentRuntime {
  const graph = createAgentGraph(deps);
  return {
    async ask(input) {
      return runGraph(graph, {
        query: input.query,
        userTier: input.userTier,
        domain: input.domain,
        location: input.location,
      });
    },
  };
}

// 재export — 외부 모듈에서 사용
export type { AgentContext, GraphDefinition } from "./types";
export { runGraph } from "./graph";
