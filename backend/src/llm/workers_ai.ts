// Workers AI LLM 클라이언트 — Cloudflare 무료 오픈모델(종량 0) 경로
// API 키 불필요. AI Query Agent·일반 실시간 응답에 사용.
// LlmClient 인터페이스를 만족하므로 HybridLlmRouter에 batch/realtime 양쪽으로 꽂을 수 있음.
// 모델명은 pricing.ts에 미등록 → recorder가 0원으로 기록(무료 할당 정합).

import type { LlmChannel, LlmClient, LlmRequest, LlmResponse } from "./types";
import { VendorError } from "./types";

// 기본 모델 — llama-3.1-8b-instruct는 2026-05-30 폐기됨. 현행 고속 모델로 교체.
const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// fp8 고속 모델이 간헐적으로 같은 토큰을 폭주시키는 붕괴(salad)를 억제.
// 한국어 답변엔 완만한 값이 안전 — 조사·어미 반복을 과도히 벌하지 않도록.
const DEFAULT_REPETITION_PENALTY = 1.1;
const DEFAULT_FREQUENCY_PENALTY = 0.3;

export interface WorkersAiClientOptions {
  ai: Ai;
  channel?: LlmChannel;
  model?: string;            // @cf/... 형식
}

export class WorkersAiLlmClient implements LlmClient {
  readonly vendor = "workers_ai";
  readonly model: string;        // pricing 키 형식: "workers_ai:<short>"
  readonly channel: LlmChannel;

  private ai: Ai;
  private cfModel: string;       // @cf/... 실제 호출 모델 ID

  constructor(opts: WorkersAiClientOptions) {
    this.ai = opts.ai;
    this.channel = opts.channel ?? "realtime";
    this.cfModel = opts.model ?? DEFAULT_MODEL;
    // 예: @cf/meta/llama-3.1-8b-instruct → workers_ai:llama-3.1-8b-instruct
    const short = this.cfModel.split("/").pop() ?? this.cfModel;
    this.model = `workers_ai:${short}`;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    try {
      const res = (await this.ai.run(this.cfModel as never, {
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: request.maxTokens ?? 512,
        temperature: request.temperature ?? 0.2,
        repetition_penalty: DEFAULT_REPETITION_PENALTY,
        frequency_penalty: DEFAULT_FREQUENCY_PENALTY,
      } as never)) as { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };

      const content = (res.response ?? "").trim();
      // usage가 오면 사용, 없으면 char/4 추정(mock과 동일 규칙)
      const inputTokens =
        res.usage?.prompt_tokens ??
        Math.ceil(request.messages.reduce((s, m) => s + m.content.length, 0) / 4);
      const outputTokens = res.usage?.completion_tokens ?? Math.ceil(content.length / 4);

      return {
        content,
        channel: request.channel ?? this.channel,
        model: this.model,
        inputTokens,
        outputTokens,
        costKrw: 0,            // recorder가 최종 환산(무료 모델 → 0)
        fromCache: false,
        latencyMs: Date.now() - startedAt,
      };
    } catch (e) {
      throw new VendorError(this.vendor, 502, e instanceof Error ? e.message : String(e));
    }
  }
}
