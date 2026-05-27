// #15 LangGraph Lite Router + Agents 단위 테스트

import { describe, expect, it } from "vitest";

import { InMemoryCacheStore } from "../src/cache/key_normalizer";
import { CircuitBreaker, InMemoryMonthlyQuery } from "../src/cost/circuit_breaker";
import { DefaultCostRecorder, InMemoryCostStore } from "../src/cost/recorder";
import { HybridLlmRouter } from "../src/llm/hybrid_router";
import { MockLlmClient } from "../src/llm/mock";
import { createAgentRuntime } from "../src/agents";
import { classifyByKeywords } from "../src/agents/router_node";

function makeRuntime() {
  const costStore = new InMemoryCostStore();
  const recorder = new DefaultCostRecorder(costStore);
  const query = new InMemoryMonthlyQuery(costStore.events);
  const breaker = new CircuitBreaker(query, 300_000);

  const llm = new HybridLlmRouter({
    batchClient: new MockLlmClient({ vendor: "anthropic", model: "anthropic:claude-haiku", channel: "batch" }),
    realtimeClient: new MockLlmClient({ vendor: "together_ai", model: "together:solar-mini", channel: "realtime" }),
    recorder,
    circuitBreaker: breaker,
  });

  const cache = new InMemoryCacheStore();
  const runtime = createAgentRuntime({ llm, cache });
  return { runtime, cache, costStore };
}

// ---------- 키워드 분류 ----------

describe("classifyByKeywords", () => {
  it("'다음 주' 키워드 → prediction", () => {
    const r = classifyByKeywords("다음 주 안면도 미세먼지 예보 알려줘");
    expect(r.intent).toBe("prediction");
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("'요약' 키워드 → generation", () => {
    const r = classifyByKeywords("이 기사를 3줄로 요약해줘");
    expect(r.intent).toBe("generation");
  });

  it("'사실인가' → factcheck", () => {
    const r = classifyByKeywords("이게 사실인가요?");
    expect(r.intent).toBe("factcheck");
  });

  it("'언제' → factcheck", () => {
    const r = classifyByKeywords("안면도 자연휴양림은 언제 생겼나요?");
    expect(r.intent).toBe("factcheck");
  });

  it("애매한 질문 → other", () => {
    const r = classifyByKeywords("안녕");
    expect(r.intent).toBe("other");
  });

  it("'시세' → prediction", () => {
    const r = classifyByKeywords("안면읍 토지 시세는?");
    expect(r.intent).toBe("prediction");
  });
});

// ---------- 그래프 실행 ----------

describe("AgentRuntime", () => {
  it("prediction 질의는 batch 채널 호출", async () => {
    const { runtime } = makeRuntime();
    const ctx = await runtime.ask({ query: "다음 주말 안면도 관광객 예측" });
    expect(ctx.intent).toBe("prediction");
    expect(ctx.answer).toBeTruthy();
    expect(ctx.llmCalls).toBe(1);
    expect(ctx.fromCache).toBe(false);
    expect(ctx.metadata?.predictionModel).toContain("claude-haiku");
  });

  it("generation 질의는 realtime 채널 호출", async () => {
    const { runtime } = makeRuntime();
    const ctx = await runtime.ask({ query: "이 문장을 다듬어줘: 안녕" });
    expect(ctx.intent).toBe("generation");
    expect(ctx.answer).toBeTruthy();
    expect(ctx.metadata?.generationModel).toContain("solar-mini");
  });

  it("두 번째 동일 질의는 캐시 히트 (LLM 호출 0회)", async () => {
    const { runtime, cache } = makeRuntime();

    await runtime.ask({ query: "다음 주말 안면도 관광객 예측" });
    expect(cache.size()).toBeGreaterThan(0);

    const second = await runtime.ask({ query: "다음 주말 안면도 관광객 예측" });
    expect(second.fromCache).toBe(true);
    expect(second.llmCalls).toBe(0);
  });

  it("의문문 변형은 같은 캐시 키로 정규화되어 히트", async () => {
    const { runtime, cache } = makeRuntime();

    await runtime.ask({ query: "다음 주 안면도 미세먼지 예보 알려줘" });
    const beforeSize = cache.size();

    // 변형: 종결 어미·구두점만 다름
    const second = await runtime.ask({ query: "다음 주 안면도 미세먼지 예보 알려주세요?" });
    expect(second.fromCache).toBe(true);
    expect(cache.size()).toBe(beforeSize);     // 새 키 안 만들어짐
  });

  it("같은 질의라도 도메인이 다르면 별도 캐시 (필터 분리)", async () => {
    const { runtime } = makeRuntime();

    const a = await runtime.ask({ query: "태안 정보", domain: "tourism" });
    const b = await runtime.ask({ query: "태안 정보", domain: "environment" });

    expect(a.cacheKey).not.toBe(b.cacheKey);
    expect(a.fromCache).toBe(false);
    expect(b.fromCache).toBe(false);
  });

  it("LLM 호출은 질의당 ≤ 2회 (PRD §6 REQ-AI-001 요구사항)", async () => {
    const { runtime } = makeRuntime();
    const ctx = await runtime.ask({ query: "다음 주말 만리포 일몰 시간" });
    expect(ctx.llmCalls).toBeLessThanOrEqual(2);
  });

  it("비용은 누적되어 costKrwTotal에 기록", async () => {
    const { runtime } = makeRuntime();
    const ctx = await runtime.ask({ query: "안면도 관광객 예측" });
    expect(ctx.costKrwTotal).toBeGreaterThanOrEqual(0);
  });
});
