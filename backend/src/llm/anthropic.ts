// Anthropic Claude Haiku 클라이언트 (배치 채널)
// PRD v1.8 §6 REQ-INFRA-001 — 비동기 작업용. Batch API로 50% 할인 활용 가능.

import type { LlmClient, LlmRequest, LlmResponse } from "./types";
import { VendorError } from "./types";

export interface AnthropicConfig {
  apiKey: string;
  model?: string;                  // 'claude-haiku-4-5-20251001' 등
  baseUrl?: string;
}

export class AnthropicClient implements LlmClient {
  readonly vendor = "anthropic";
  readonly channel = "batch" as const;
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(cfg: AnthropicConfig) {
    this.apiKey = cfg.apiKey;
    this.model = cfg.model ?? "claude-haiku-4-5-20251001";
    this.baseUrl = cfg.baseUrl ?? "https://api.anthropic.com";
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const started = Date.now();
    const systemMsg = request.messages.find((m) => m.role === "system")?.content;
    const userMessages = request.messages.filter((m) => m.role !== "system");

    const body = {
      model: this.model,
      max_tokens: request.maxTokens ?? 800,
      temperature: request.temperature ?? 0.1,
      system: systemMsg,
      messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
    };

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new VendorError("anthropic", res.status, text || res.statusText);
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };
    const content = data.content.map((b) => b.text).join("");
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;

    return {
      content,
      channel: this.channel,
      model: `anthropic:${this.model}`,
      inputTokens,
      outputTokens,
      costKrw: 0,                  // 호출 측에서 recorder를 통해 계산·적재
      fromCache: false,
      latencyMs: Date.now() - started,
    };
  }
}
