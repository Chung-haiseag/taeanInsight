// 비용 이벤트 기록 미들웨어
// 모든 LLM·외부 API 호출 후 cost_events 테이블에 적재
// PRD v1.8 §6 REQ-COST-001

import type { CostEvent } from "../types";
import { calculateExternalApiCostKrw, calculateLlmCostKrw, isKnownModel, type ModelKey } from "./pricing";

export interface CostRecorder {
  recordLlm(args: {
    model: string;
    vendor: string;
    inputTokens: number;
    outputTokens: number;
    metadata?: Record<string, unknown>;
  }): Promise<CostEvent>;

  recordExternalApi(args: {
    vendor: string;
    calls: number;
    metadata?: Record<string, unknown>;
  }): Promise<CostEvent>;

  recordCustom(event: CostEvent): Promise<CostEvent>;
}

// 영구 저장소 추상화 — Postgres·D1·KV 어디로 갈지에 따라 구현체만 교체
export interface CostStore {
  insert(event: CostEvent): Promise<void>;
}

export class DefaultCostRecorder implements CostRecorder {
  constructor(private store: CostStore) {}

  async recordLlm(args: {
    model: string;
    vendor: string;
    inputTokens: number;
    outputTokens: number;
    metadata?: Record<string, unknown>;
  }): Promise<CostEvent> {
    if (!isKnownModel(args.model)) {
      // 알 수 없는 모델은 0원으로 기록 (모니터링 가능하게)
      console.warn(`[cost] Unknown model "${args.model}" — recording 0 KRW`);
    }
    const amountKrw = isKnownModel(args.model)
      ? calculateLlmCostKrw(args.model as ModelKey, args.inputTokens, args.outputTokens)
      : 0;
    const event: CostEvent = {
      eventAt: new Date().toISOString(),
      category: "llm_inference",
      vendor: args.vendor,
      amountKrw,
      quantity: args.inputTokens + args.outputTokens,
      unit: "tokens",
      metadata: {
        model: args.model,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        ...args.metadata,
      },
    };
    await this.store.insert(event);
    return event;
  }

  async recordExternalApi(args: {
    vendor: string;
    calls: number;
    metadata?: Record<string, unknown>;
  }): Promise<CostEvent> {
    const event: CostEvent = {
      eventAt: new Date().toISOString(),
      category: args.vendor === "kakao_alimtalk" || args.vendor === "sms" ? "sms_kakao" : "external_api",
      vendor: args.vendor,
      amountKrw: calculateExternalApiCostKrw(args.vendor, args.calls),
      quantity: args.calls,
      unit: "calls",
      metadata: args.metadata,
    };
    await this.store.insert(event);
    return event;
  }

  async recordCustom(event: CostEvent): Promise<CostEvent> {
    const withDefaults: CostEvent = {
      eventAt: event.eventAt ?? new Date().toISOString(),
      ...event,
    };
    await this.store.insert(withDefaults);
    return withDefaults;
  }
}

// 인메모리 구현체 — 테스트용 + Phase 1 PoC. 실제 운영은 Postgres/D1 구현체로 교체
export class InMemoryCostStore implements CostStore {
  events: CostEvent[] = [];

  async insert(event: CostEvent): Promise<void> {
    this.events.push(event);
  }

  // 테스트·디버그용 유틸
  clear(): void {
    this.events = [];
  }

  totalKrw(): number {
    return this.events.reduce((sum, e) => sum + e.amountKrw, 0);
  }
}
