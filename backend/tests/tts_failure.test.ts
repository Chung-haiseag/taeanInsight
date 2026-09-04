import { describe, it, expect } from "vitest";
// @ts-expect-error — 로컬 생성기 라이브러리(.mjs, 타입 없음). kg_extract.test.ts와 같은 방식.
import { classifyTtsFailure, TTS_PROMPT } from "../../tools/lib/tts-failure.mjs";

// 2026-09-05 확정: 엿새 동안 매일 '400 재시도'만 찍던 오류의 본문은
//   "Model tried to generate text, but it should only be used for TTS."
//   TTS 전용 모델이 **오디오 대신 글을 쓰려다** 거부된 것이다. 프롬프트의 '띄어쓰기를 교정해서 읽되'라는
//   작업 지시가 원인이고, 확률적이라 같은 기사도 되다 말다 한다(재현은 200, 배치는 400).
//   ⚠ 400이라고 전부 '요청 오류'가 아니다 — 이건 재시도하면 대개 된다. 본문을 보고 갈라야 한다.
describe("TTS 실패 분류", () => {
  it("429는 키 소진 — 다음 키로", () => {
    expect(classifyTtsFailure(429, "quota exceeded")).toBe("exhausted");
  });

  it("'글을 쓰려 했다' 400은 확률 오류 — 재시도", () => {
    expect(classifyTtsFailure(400, "Model tried to generate text, but it should only be used for TTS. Make sure your instructions are clear")).toBe("retry");
  });

  it("그 밖의 4xx는 요청 오류 — 다시 보내도 같으니 건너뜀", () => {
    expect(classifyTtsFailure(400, "Invalid JSON payload received")).toBe("skip");
    expect(classifyTtsFailure(403, "API key not valid")).toBe("skip");
    expect(classifyTtsFailure(404, "model not found")).toBe("skip");
  });

  it("5xx는 일시 오류 — 재시도", () => {
    expect(classifyTtsFailure(500, "")).toBe("retry");
    expect(classifyTtsFailure(503, "overloaded")).toBe("retry");
  });

  it("본문이 없어도 터지지 않는다", () => {
    expect(classifyTtsFailure(400, undefined)).toBe("skip");
  });
});

describe("TTS 프롬프트", () => {
  it("말투만 지시하고 작업(교정·수정·요약)을 시키지 않는다 — 시키면 모델이 글을 쓴다", () => {
    expect(TTS_PROMPT).not.toMatch(/교정|수정|고쳐|요약|바꿔/);
    expect(TTS_PROMPT).toMatch(/읽/);
  });
});
