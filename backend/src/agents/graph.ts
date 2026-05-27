// Lite 그래프 실행기 — 노드를 순차/조건부 실행
// PRD v1.8 §6 REQ-AI-001 — 실시간 LLM 호출 평균 ≤ 2회 목표

import type { AgentContext, GraphDefinition } from "./types";

export interface GraphExecutorOptions {
  maxSteps?: number;          // 무한 루프 방지
}

export async function runGraph(
  graph: GraphDefinition,
  initialCtx: AgentContext,
  opts: GraphExecutorOptions = {},
): Promise<AgentContext> {
  const maxSteps = opts.maxSteps ?? 6;
  let ctx: AgentContext = {
    llmCalls: 0,
    costKrwTotal: 0,
    sources: [],
    ...initialCtx,
  };
  let current: string | null = graph.entry;
  let steps = 0;

  while (current && steps < maxSteps) {
    const node = graph.nodes[current];
    if (!node) {
      throw new Error(`Graph node not found: ${current}`);
    }
    const { next, patch } = await node(ctx);
    if (patch) {
      ctx = { ...ctx, ...patch };
      // sources/llmCalls/costKrwTotal는 누적
      if (patch.sources) {
        ctx.sources = [...(initialCtx.sources ?? []), ...patch.sources];
      }
    }
    current = next;
    steps += 1;
  }

  if (steps >= maxSteps) {
    throw new Error(`Graph exceeded maxSteps (${maxSteps})`);
  }

  return ctx;
}
