// Mock LLM 클라이언트 — API 키 없을 때 로컬 개발·테스트용
// 실제 호출 대신 결정론적 응답 반환

import type { LlmChannel, LlmClient, LlmRequest, LlmResponse } from "./types";

export class MockLlmClient implements LlmClient {
  readonly vendor: string;
  readonly model: string;
  readonly channel: LlmChannel;

  constructor(opts: { vendor?: string; model?: string; channel?: LlmChannel } = {}) {
    this.vendor = opts.vendor ?? "mock";
    this.model = opts.model ?? "mock:echo";
    this.channel = opts.channel ?? "realtime";
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const userMsg = request.messages.findLast?.((m) => m.role === "user")?.content
      ?? request.messages.filter((m) => m.role === "user").pop()?.content
      ?? "";

    // 요청 토큰 = 메시지 내용 길이 // 4 (대략적 추정)
    const inputTokens = Math.ceil(
      request.messages.reduce((sum, m) => sum + m.content.length, 0) / 4,
    );
    const content = `[mock:${this.vendor}] ${userMsg.slice(0, 80)}`;
    const outputTokens = Math.ceil(content.length / 4);

    return {
      content,
      channel: this.channel,
      model: this.model,
      inputTokens,
      outputTokens,
      costKrw: 0,
      fromCache: false,
      latencyMs: 5,
    };
  }
}
