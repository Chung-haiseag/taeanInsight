// 비용 모니터링 API 라우터
// GET  /api/cost/summary             — 이번 달 누적·임계값 상태
// POST /api/cost/check-circuit       — 호출 직전 차단 여부 체크
// POST /api/cost/record              — 비용 이벤트 수동 기록 (테스트·외부 시스템 적재용)

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import { CircuitBreaker, InMemoryMonthlyQuery, currentMonth } from "./circuit_breaker";
import { CostAggregator, ConsoleNotifier, SlackNotifier } from "./aggregator";
import { DefaultCostRecorder, InMemoryCostStore } from "./recorder";

export const costRouter = new Hono<{ Bindings: Env }>();

// ⚠️ 부트스트랩 단계 — 인메모리 store를 모듈 전역으로 둠.
// 백엔드가 D1/Postgres와 연결되면 이 부분이 영구 저장소 구현체로 교체됨.
const memoryStore = new InMemoryCostStore();
const monthlyQuery = new InMemoryMonthlyQuery(memoryStore.events);

function getLimits(env: Env): { limitKrw: number; thresholds: number[] } {
  const limitKrw = Number(env.MONTHLY_COST_LIMIT_KRW);
  const thresholds = env.ALERT_THRESHOLDS.split(",").map(Number);
  return { limitKrw, thresholds };
}

function makeNotifier(env: Env) {
  return env.SLACK_WEBHOOK_URL
    ? new SlackNotifier(env.SLACK_WEBHOOK_URL)
    : new ConsoleNotifier();
}

// GET /api/cost/summary
costRouter.get("/summary", async (c) => {
  const { limitKrw, thresholds } = getLimits(c.env);
  const aggregator = new CostAggregator(
    {
      listEvents: async (month) =>
        memoryStore.events.filter((e) => (e.eventAt ?? "").startsWith(month)),
      getNotifiedThresholds: async () => [],
      markNotified: async () => {},
    },
    new ConsoleNotifier(),
    limitKrw,
    thresholds,
  );
  const report = await aggregator.run();
  return c.json(report);
});

// POST /api/cost/check-circuit
const circuitSchema = z.object({
  priority: z.enum(["critical", "normal", "best_effort"]),
});

costRouter.post("/check-circuit", async (c) => {
  const parsed = circuitSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  }
  const { limitKrw } = getLimits(c.env);
  const breaker = new CircuitBreaker(monthlyQuery, limitKrw);
  const decision = await breaker.check(parsed.data.priority);
  return c.json(decision);
});

// POST /api/cost/record
const recordSchema = z.object({
  kind: z.enum(["llm", "external_api", "custom"]),
  model: z.string().optional(),
  vendor: z.string(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  calls: z.number().optional(),
  amountKrw: z.number().optional(),
  category: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

costRouter.post("/record", async (c) => {
  const parsed = recordSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  }
  const recorder = new DefaultCostRecorder(memoryStore);
  const body = parsed.data;

  if (body.kind === "llm") {
    if (!body.model || body.inputTokens == null || body.outputTokens == null) {
      return c.json({ error: "missing_llm_fields" }, 400);
    }
    const event = await recorder.recordLlm({
      model: body.model,
      vendor: body.vendor,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      metadata: body.metadata,
    });
    return c.json(event);
  }

  if (body.kind === "external_api") {
    if (body.calls == null) {
      return c.json({ error: "missing_external_api_fields" }, 400);
    }
    const event = await recorder.recordExternalApi({
      vendor: body.vendor,
      calls: body.calls,
      metadata: body.metadata,
    });
    return c.json(event);
  }

  // custom
  if (body.amountKrw == null || !body.category) {
    return c.json({ error: "missing_custom_fields" }, 400);
  }
  const event = await recorder.recordCustom({
    category: body.category as never,
    vendor: body.vendor,
    amountKrw: body.amountKrw,
    metadata: body.metadata,
  });
  return c.json(event);
});

// 현재 월 (디버그용)
costRouter.get("/month", (c) => c.json({ month: currentMonth() }));

// 부트스트랩 단계에서 store에 직접 접근하기 위한 export (테스트용)
export const __test = { memoryStore, monthlyQuery };
