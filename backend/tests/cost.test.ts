// #19 비용 모니터링 + 서킷 브레이커 단위 테스트
// 실행: npm test

import { describe, expect, it } from "vitest";

import { CircuitBreaker, InMemoryMonthlyQuery, currentMonth } from "../src/cost/circuit_breaker";
import { CostAggregator, ConsoleNotifier, type Notifier } from "../src/cost/aggregator";
import { DefaultCostRecorder, InMemoryCostStore } from "../src/cost/recorder";
import { calculateLlmCostKrw, isKnownModel } from "../src/cost/pricing";
import type { CostEvent, MonthlyCostReport } from "../src/types";

// ---------- Pricing ----------

describe("pricing.calculateLlmCostKrw", () => {
  it("Solar Mini는 매우 저렴 (1M 토큰당 약 280원)", () => {
    const cost = calculateLlmCostKrw("together:solar-mini", 1_000_000, 0);
    expect(cost).toBeCloseTo(280, 0);
  });

  it("Claude Haiku Batch는 일반 대비 정확히 50% 할인", () => {
    const normal = calculateLlmCostKrw("anthropic:claude-haiku", 1_000_000, 1_000_000);
    const batch = calculateLlmCostKrw("anthropic:claude-haiku-batch", 1_000_000, 1_000_000);
    expect(batch).toBeCloseTo(normal * 0.5, 1);
  });

  it("알려지지 않은 모델은 isKnownModel false", () => {
    expect(isKnownModel("openai:gpt-99")).toBe(false);
    expect(isKnownModel("together:solar-mini")).toBe(true);
  });
});

// ---------- Recorder ----------

describe("DefaultCostRecorder", () => {
  it("LLM 호출을 cost_events에 적재", async () => {
    const store = new InMemoryCostStore();
    const recorder = new DefaultCostRecorder(store);

    const event = await recorder.recordLlm({
      model: "together:solar-mini",
      vendor: "together_ai",
      inputTokens: 1500,
      outputTokens: 500,
    });

    expect(event.category).toBe("llm_inference");
    expect(event.vendor).toBe("together_ai");
    expect(event.amountKrw).toBeGreaterThan(0);
    expect(store.events).toHaveLength(1);
  });

  it("알 수 없는 모델은 0원으로 기록", async () => {
    const store = new InMemoryCostStore();
    const recorder = new DefaultCostRecorder(store);

    const event = await recorder.recordLlm({
      model: "openai:gpt-99",
      vendor: "openai",
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(event.amountKrw).toBe(0);
  });

  it("카카오 알림톡은 sms_kakao 카테고리로 분류", async () => {
    const store = new InMemoryCostStore();
    const recorder = new DefaultCostRecorder(store);

    const event = await recorder.recordExternalApi({
      vendor: "kakao_alimtalk",
      calls: 100,
    });

    expect(event.category).toBe("sms_kakao");
    expect(event.amountKrw).toBe(1200);    // 100건 * 12원
  });

  it("무료 외부 API는 0원", async () => {
    const store = new InMemoryCostStore();
    const recorder = new DefaultCostRecorder(store);

    const event = await recorder.recordExternalApi({
      vendor: "tour_api",
      calls: 1000,
    });

    expect(event.amountKrw).toBe(0);
  });
});

// ---------- Circuit Breaker ----------

describe("CircuitBreaker", () => {
  const limit = 300_000;
  const month = currentMonth();

  it("한도 미만이면 모든 우선순위 허용", async () => {
    const query = new InMemoryMonthlyQuery([
      { eventAt: `${month}-01T00:00:00Z`, category: "llm_inference", vendor: "x", amountKrw: 100_000 },
    ]);
    const breaker = new CircuitBreaker(query, limit);

    for (const p of ["critical", "normal", "best_effort"] as const) {
      const d = await breaker.check(p);
      expect(d.allowed).toBe(true);
      expect(d.ratio).toBeCloseTo(100_000 / limit);
    }
  });

  it("100% ~ 110% 사이는 critical만 허용", async () => {
    const query = new InMemoryMonthlyQuery([
      { eventAt: `${month}-01T00:00:00Z`, category: "llm_inference", vendor: "x", amountKrw: 305_000 },
    ]);
    const breaker = new CircuitBreaker(query, limit);

    expect((await breaker.check("critical")).allowed).toBe(true);
    expect((await breaker.check("normal")).allowed).toBe(false);
    expect((await breaker.check("best_effort")).allowed).toBe(false);
  });

  it("110% 이상은 critical도 차단 (수동 개입 필요)", async () => {
    const query = new InMemoryMonthlyQuery([
      { eventAt: `${month}-01T00:00:00Z`, category: "llm_inference", vendor: "x", amountKrw: 340_000 },
    ]);
    const breaker = new CircuitBreaker(query, limit);

    expect((await breaker.check("critical")).allowed).toBe(false);
  });

  it("이전 달 이벤트는 누적에서 제외", async () => {
    const lastMonth = "2026-04";
    const query = new InMemoryMonthlyQuery([
      { eventAt: `${lastMonth}-15T00:00:00Z`, category: "llm_inference", vendor: "x", amountKrw: 500_000 },
    ]);
    const breaker = new CircuitBreaker(query, limit);
    const d = await breaker.check("normal");
    expect(d.allowed).toBe(true);
    expect(d.monthlyTotalKrw).toBe(0);
  });
});

// ---------- Aggregator ----------

class RecordingNotifier implements Notifier {
  calls: Array<{ report: MonthlyCostReport; threshold: number }> = [];
  notifyThresholdCrossed(report: MonthlyCostReport, threshold: number): Promise<void> {
    this.calls.push({ report, threshold });
    return Promise.resolve();
  }
}

describe("CostAggregator", () => {
  const month = currentMonth();
  const limit = 300_000;
  const thresholds = [0.7, 0.9, 1.0];

  function makeStore(events: CostEvent[], notified: number[] = []) {
    const notifiedRecord = new Set(notified);
    return {
      listEvents: async () => events,
      getNotifiedThresholds: async () => Array.from(notifiedRecord),
      markNotified: async (_: string, t: number) => {
        notifiedRecord.add(t);
      },
    };
  }

  it("이번 달 총 비용·카테고리별 분포 계산", async () => {
    const events: CostEvent[] = [
      { eventAt: `${month}-01T00:00:00Z`, category: "llm_inference", vendor: "anthropic", amountKrw: 100_000 },
      { eventAt: `${month}-02T00:00:00Z`, category: "external_api", vendor: "tour_api", amountKrw: 0 },
      { eventAt: `${month}-03T00:00:00Z`, category: "sms_kakao", vendor: "kakao_alimtalk", amountKrw: 12_000 },
    ];
    const notifier = new RecordingNotifier();
    const aggregator = new CostAggregator(makeStore(events), notifier, limit, thresholds);

    const report = await aggregator.run();

    expect(report.totalKrw).toBe(112_000);
    expect(report.ratio).toBeCloseTo(112_000 / limit);
    expect(report.byCategory.llm_inference).toBe(100_000);
    expect(report.byCategory.sms_kakao).toBe(12_000);
    expect(notifier.calls).toHaveLength(0);    // 임계값 미달
  });

  it("70% 임계값 통과 시 알림 한 번 발송", async () => {
    const events: CostEvent[] = [
      { eventAt: `${month}-15T00:00:00Z`, category: "llm_inference", vendor: "x", amountKrw: 220_000 },
    ];
    const notifier = new RecordingNotifier();
    const aggregator = new CostAggregator(makeStore(events), notifier, limit, thresholds);

    await aggregator.run();
    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0].threshold).toBe(0.7);
  });

  it("같은 임계값 알림은 이번 달 한 번만", async () => {
    const events: CostEvent[] = [
      { eventAt: `${month}-15T00:00:00Z`, category: "llm_inference", vendor: "x", amountKrw: 220_000 },
    ];
    const notifier = new RecordingNotifier();
    const store = makeStore(events, [0.7]);    // 이미 알림 발송됨

    const aggregator = new CostAggregator(store, notifier, limit, thresholds);
    await aggregator.run();
    expect(notifier.calls).toHaveLength(0);
  });

  it("90%·100% 동시 통과 시 두 알림 모두 발송", async () => {
    const events: CostEvent[] = [
      { eventAt: `${month}-20T00:00:00Z`, category: "llm_inference", vendor: "x", amountKrw: 305_000 },
    ];
    const notifier = new RecordingNotifier();
    const aggregator = new CostAggregator(makeStore(events), notifier, limit, thresholds);

    await aggregator.run();
    const sent = notifier.calls.map((c) => c.threshold).sort();
    expect(sent).toEqual([0.7, 0.9, 1.0]);
  });
});
