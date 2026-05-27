// Hybrid LLM Router — 채널 결정 + 비용 기록 + 서킷 차단 통합
// PRD v1.8 §6 REQ-AI-001·REQ-INFRA-001·REQ-COST-001

import type { CallPriority, CircuitBreaker } from "../cost/circuit_breaker";
import type { CostRecorder } from "../cost/recorder";
import type { LlmChannel, LlmClient, LlmIntent, LlmRequest, LlmResponse } from "./types";
import { CircuitOpenError } from "./types";

export interface HybridRouterDeps {
  batchClient: LlmClient;          // Anthropic Claude Haiku Batch
  realtimeClient: LlmClient;       // Together AI Solar Mini
  recorder: CostRecorder;
  circuitBreaker: CircuitBreaker;
}

export class HybridLlmRouter {
  constructor(private deps: HybridRouterDeps) {}

  /**
   * 채널 결정 + 차단 체크 + 호출 + 비용 기록의 단일 진입점.
   *
   * 1) request.channel 미지정 시 intent로 추정 (prediction·factcheck = batch, 그 외 = realtime)
   * 2) 서킷 브레이커 체크 — priority에 따라 차단 가능
   * 3) 해당 채널 클라이언트 호출
   * 4) 응답 후 비용 자동 기록 + costKrw 채워서 반환
   */
  async route(request: LlmRequest, priority: CallPriority = "normal"): Promise<LlmResponse> {
    const channel = request.channel ?? this.pickChannel(request.intent);

    const decision = await this.deps.circuitBreaker.check(priority);
    if (!decision.allowed) {
      throw new CircuitOpenError(
        decision.reason ?? "circuit_open",
        decision.monthlyTotalKrw,
        decision.limitKrw,
      );
    }

    const client = channel === "batch" ? this.deps.batchClient : this.deps.realtimeClient;
    const response = await client.complete({ ...request, channel });

    // 비용 자동 기록 (recorder가 model별 단가로 KRW 환산)
    const event = await this.deps.recorder.recordLlm({
      model: response.model,
      vendor: client.vendor,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      metadata: {
        channel,
        latencyMs: response.latencyMs,
        intent: request.intent,
        ...request.metadata,
      },
    });

    return { ...response, costKrw: event.amountKrw };
  }

  /** intent 기반 채널 결정 */
  pickChannel(intent: LlmIntent | undefined): LlmChannel {
    if (!intent) return "realtime";
    // 사전 생성·예측·팩트체크는 배치 (Anthropic Batch 50% 할인 활용)
    if (intent === "prediction" || intent === "factcheck") return "batch";
    return "realtime";
  }
}
