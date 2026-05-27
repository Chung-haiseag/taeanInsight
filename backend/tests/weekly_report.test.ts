// #22 주간 인사이트 리포트 파이프라인 단위 테스트

import { describe, expect, it } from "vitest";

import { CircuitBreaker, InMemoryMonthlyQuery } from "../src/cost/circuit_breaker";
import { DefaultCostRecorder, InMemoryCostStore } from "../src/cost/recorder";
import { HybridLlmRouter } from "../src/llm/hybrid_router";
import { MockLlmClient } from "../src/llm/mock";
import { WeeklyReportPipeline } from "../src/reports/weekly_pipeline";
import { getIsoWeekId } from "../src/reports/types";

function makePipeline() {
  const costStore = new InMemoryCostStore();
  const recorder = new DefaultCostRecorder(costStore);
  const breaker = new CircuitBreaker(new InMemoryMonthlyQuery(costStore.events), 300_000);
  const llm = new HybridLlmRouter({
    batchClient: new MockLlmClient({ vendor: "anthropic", model: "anthropic:claude-haiku", channel: "batch" }),
    realtimeClient: new MockLlmClient({ vendor: "together_ai", model: "together:solar-mini", channel: "realtime" }),
    recorder,
    circuitBreaker: breaker,
  });
  return {
    pipeline: new WeeklyReportPipeline({ llm, hitlReviewerId: "editor-1" }),
    costStore,
  };
}

describe("WeeklyReportPipeline.generate", () => {
  it("5개 섹션이 모두 생성", async () => {
    const { pipeline } = makePipeline();
    const report = await pipeline.generate("2026-W22");
    expect(report.weekId).toBe("2026-W22");
    expect(report.sections).toHaveLength(5);
    expect(report.sections.map((s) => s.key)).toEqual([
      "summary",
      "tourism_weather",
      "environment",
      "realestate",
      "events",
    ]);
  });

  it("Anthropic Batch 채널만 호출 (50% 할인 활용)", async () => {
    const { pipeline, costStore } = makePipeline();
    await pipeline.generate();
    const channels = costStore.events.map((e) => e.metadata?.channel);
    expect(channels.every((c) => c === "batch")).toBe(true);
  });

  it("AI 라벨이 ai_assisted로 기본 설정", async () => {
    const { pipeline } = makePipeline();
    const report = await pipeline.generate();
    expect(report.aiLabel).toBe("ai_assisted");
  });

  it("summary 섹션 내용이 report.summary로 노출", async () => {
    const { pipeline } = makePipeline();
    const report = await pipeline.generate();
    expect(report.summary).toBeTruthy();
    expect(report.summary).toBe(report.sections[0].content);
  });

  it("factsLoader가 제공되면 프롬프트에 주입", async () => {
    const costStore = new InMemoryCostStore();
    const recorder = new DefaultCostRecorder(costStore);
    const breaker = new CircuitBreaker(new InMemoryMonthlyQuery(costStore.events), 300_000);
    const llm = new HybridLlmRouter({
      batchClient: new MockLlmClient({ vendor: "anthropic", model: "anthropic:claude-haiku", channel: "batch" }),
      realtimeClient: new MockLlmClient({ vendor: "together_ai", model: "together:solar-mini", channel: "realtime" }),
      recorder,
      circuitBreaker: breaker,
    });

    const factsCalls: string[] = [];
    const pipeline = new WeeklyReportPipeline({
      llm,
      hitlReviewerId: "u",
      factsLoader: async (_, sectionKey) => {
        factsCalls.push(sectionKey);
        return `자료: ${sectionKey}`;
      },
    });

    await pipeline.generate();
    expect(factsCalls).toHaveLength(5);
    expect(factsCalls).toContain("tourism_weather");
  });
});

describe("WeeklyReportPipeline.validateForPublish", () => {
  it("HITL 검토자 있고 출처 있으면 통과", async () => {
    const { pipeline } = makePipeline();
    const report = await pipeline.generate();
    const result = await pipeline.validateForPublish(report);
    expect(result.approved).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("HITL 검토자 없으면 ai_generated는 거부", async () => {
    const { pipeline } = makePipeline();
    const report = await pipeline.generate();
    const noReviewer = { ...report, aiLabel: "ai_generated" as const, hitlReviewerId: undefined };
    const result = await pipeline.validateForPublish(noReviewer);
    expect(result.approved).toBe(false);
  });
});

describe("getIsoWeekId", () => {
  it("ISO 주차 형식 (YYYY-Www)", () => {
    const id = getIsoWeekId(new Date("2026-08-15T00:00:00Z"));
    expect(id).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("2026-01-01은 W01 부근", () => {
    const id = getIsoWeekId(new Date("2026-01-05T00:00:00Z"));
    expect(id.startsWith("2026-W")).toBe(true);
  });
});
