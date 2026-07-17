// Workers AI 클라이언트가 토큰 붕괴 억제 파라미터를 모델 호출에 전달하는지 검증.
// fp8 모델의 반복 붕괴(salad)를 줄이기 위해 repetition_penalty·frequency_penalty를 넘겨야 한다.

import { describe, it, expect } from "vitest";

import { WorkersAiLlmClient } from "../src/llm/workers_ai";

// ai.run에 전달된 옵션을 캡처하는 가짜 AI 바인딩
function fakeAi() {
  const calls: Array<{ model: unknown; opts: Record<string, unknown> }> = [];
  const ai = {
    run: async (model: unknown, opts: Record<string, unknown>) => {
      calls.push({ model, opts });
      return { response: "정상 답변입니다." };
    },
  };
  return { ai, calls };
}

describe("WorkersAiLlmClient.complete", () => {
  it("반복 억제 파라미터(repetition_penalty·frequency_penalty)를 모델 호출에 전달한다", async () => {
    const { ai, calls } = fakeAi();
    const client = new WorkersAiLlmClient({ ai: ai as unknown as Ai });

    await client.complete({
      channel: "realtime",
      maxTokens: 800,
      temperature: 0.2,
      messages: [{ role: "user", content: "안녕" }],
    });

    expect(calls).toHaveLength(1);
    const opts = calls[0].opts;
    // repetition_penalty는 1보다 커야 반복을 억제(중립 1.0)
    expect(typeof opts.repetition_penalty).toBe("number");
    expect(opts.repetition_penalty as number).toBeGreaterThan(1);
    // frequency_penalty는 0보다 커야 동일 토큰 남발을 억제
    expect(typeof opts.frequency_penalty).toBe("number");
    expect(opts.frequency_penalty as number).toBeGreaterThan(0);
    // 기존 파라미터도 유지
    expect(opts.max_tokens).toBe(800);
    expect(opts.temperature).toBe(0.2);
  });
});
