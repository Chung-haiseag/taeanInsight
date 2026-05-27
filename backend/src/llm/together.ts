// Together AI Solar Mini 클라이언트 (실시간 채널)
// PRD v1.8 §6 REQ-INFRA-001 — 사용자 질의 응답·시민기자 Co-Pilot 등 동기 호출용

import type { LlmClient, LlmRequest, LlmResponse } from "./types";
import { VendorError } from "./types";

export interface TogetherConfig {
  apiKey: string;
  model?: string;                  // 'upstage/SOLAR-10.7B-Instruct-v1.0'
  baseUrl?: string;
}

export class TogetherClient implements LlmClient {
  readonly vendor = "together_ai";
  readonly channel = "realtime" as const;
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(cfg: TogetherConfig) {
    this.apiKey = cfg.apiKey;
    this.model = cfg.model ?? "upstage/SOLAR-10.7B-Instruct-v1.0";
    this.baseUrl = cfg.baseUrl ?? "https://api.together.xyz";
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const started = Date.now();
    const body = {
      model: this.model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? 600,
      temperature: request.temperature ?? 0.1,
    };

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new VendorError("together_ai", res.status, text || res.statusText);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const content = data.choices[0]?.message.content ?? "";
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;

    return {
      content,
      channel: this.channel,
      model: `together:solar-mini`,
      inputTokens,
      outputTokens,
      costKrw: 0,
      fromCache: false,
      latencyMs: Date.now() - started,
    };
  }
}
