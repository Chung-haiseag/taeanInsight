// #1 Hybrid LLM Router 단위 테스트

import { describe, expect, it } from "vitest";

import { CircuitBreaker, InMemoryMonthlyQuery, currentMonth } from "../src/cost/circuit_breaker";
import { DefaultCostRecorder, InMemoryCostStore } from "../src/cost/recorder";
import { HybridLlmRouter } from "../src/llm/hybrid_router";
import { MockLlmClient } from "../src/llm/mock";
import { CircuitOpenError } from "../src/llm/types";

function makeRouter(opts: { monthlySpent?: number; limit?: number } = {}) {
  const store = new InMemoryCostStore();
  const recorder = new DefaultCostRecorder(store);
  const limit = opts.limit ?? 300_000;
  const month = currentMonth();
  const query = new InMemoryMonthlyQuery(
    opts.monthlySpent
      ? [
          {
            eventAt: `${month}-15T00:00:00Z`,
            category: "llm_inference",
            vendor: "x",
            amountKrw: opts.monthlySpent,
          },
        ]
      : [],
  );
  const breaker = new CircuitBreaker(query, limit);

  const batchClient = new MockLlmClient({
    vendor: "anthropic",
    model: "anthropic:claude-haiku",
    channel: "batch",
  });
  const realtimeClient = new MockLlmClient({
    vendor: "together_ai",
    model: "together:solar-mini",
    channel: "realtime",
  });

  return {
    router: new HybridLlmRouter({ batchClient, realtimeClient, recorder, circuitBreaker: breaker }),
    store,
  };
}

describe("HybridLlmRouter", () => {
  it("intent 미지정 시 realtime 채널 선택", async () => {
    const { router } = makeRouter();
    const res = await router.route({
      messages: [{ role: "user", content: "안녕" }],
    });
    expect(res.channel).toBe("realtime");
    expect(res.model).toBe("together:solar-mini");
  });

  it("intent=prediction은 batch 채널", async () => {
    const { router } = makeRouter();
    const res = await router.route({
      intent: "prediction",
      messages: [{ role: "user", content: "다음 주 안면도" }],
    });
    expect(res.channel).toBe("batch");
    expect(res.model).toBe("anthropic:claude-haiku");
  });

  it("intent=factcheck도 batch", async () => {
    const { router } = makeRouter();
    const res = await router.route({
      intent: "factcheck",
      messages: [{ role: "user", content: "사실 확인" }],
    });
    expect(res.channel).toBe("batch");
  });

  it("intent=generation은 realtime", async () => {
    const { router } = makeRouter();
    const res = await router.route({
      intent: "generation",
      messages: [{ role: "user", content: "다듬어줘" }],
    });
    expect(res.channel).toBe("realtime");
  });

  it("request.channel 명시 시 그대로 사용", async () => {
    const { router } = makeRouter();
    const res = await router.route({
      channel: "batch",
      intent: "generation",                  // intent와 충돌해도 channel 우선
      messages: [{ role: "user", content: "x" }],
    });
    expect(res.channel).toBe("batch");
  });

  it("응답 후 비용이 자동 기록됨", async () => {
    const { router, store } = makeRouter();
    expect(store.events.length).toBe(0);

    const res = await router.route({
      messages: [{ role: "user", content: "안녕".repeat(100) }],
    });

    expect(store.events.length).toBe(1);
    expect(store.events[0].category).toBe("llm_inference");
    expect(res.costKrw).toBeGreaterThanOrEqual(0);
  });

  it("월 한도 초과 + normal priority → CircuitOpenError", async () => {
    const { router } = makeRouter({ monthlySpent: 305_000 });
    await expect(
      router.route({ messages: [{ role: "user", content: "x" }] }, "normal"),
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("월 한도 초과 + critical priority는 허용", async () => {
    const { router } = makeRouter({ monthlySpent: 305_000 });
    const res = await router.route(
      { messages: [{ role: "user", content: "적조 알림" }] },
      "critical",
    );
    expect(res.content).toContain("[mock:");
  });

  it("110% 이상이면 critical도 차단", async () => {
    const { router } = makeRouter({ monthlySpent: 340_000 });
    await expect(
      router.route({ messages: [{ role: "user", content: "x" }] }, "critical"),
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
