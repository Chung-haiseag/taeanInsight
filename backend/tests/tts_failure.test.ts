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
    expect(classifyTtsFailure(404, "model not found")).toBe("skip");
  });

  // 2026-11-09 확정 — 생성기가 **열흘 가까이 하루 0~7건**만 만들고 있었다. 이유:
  //   키#1 이 일일한도(429)로 빠지면 키#2 로 넘어가는데, 키#2 는 구글이 정지시킨 키라 403 을 냈다.
  //   그런데 403 이 'skip'(=이 기사만 실패)이어서 **키는 살아 있는 것으로 남고** 기사만 버려졌다.
  //   다음 기사도 같은 키#2 를 집어 또 403 → 또 skip. 멀쩡한 키#3 은 **한 번도 쓰이지 않았다**
  //   (매일 로그의 '키사용 N/0/0' 이 그 증거다). 죽은 키 하나가 그날 치 기사를 전부 먹었다.
  //   403·401 은 이 요청이 아니라 **이 키**가 문제다 — 기사를 버릴 게 아니라 키를 빼야 한다.
  it("401·403 은 키가 죽은 것 — 기사를 버리지 말고 그 키를 뺀다", () => {
    expect(classifyTtsFailure(403, "Permission denied on the service.")).toBe("deadkey");
    expect(classifyTtsFailure(403, "Permission denied: Consumer 'projects/216847174493' has been suspended.")).toBe("deadkey");
    expect(classifyTtsFailure(403, "API key not valid")).toBe("deadkey");
    expect(classifyTtsFailure(401, "Request had invalid authentication credentials")).toBe("deadkey");
  });

  it("죽은 키와 한도 소진을 섞지 않는다 — 한도는 내일 풀리고, 죽은 키는 사람이 갈아야 한다", () => {
    expect(classifyTtsFailure(429, "quota exceeded")).not.toBe("deadkey");
    expect(classifyTtsFailure(403, "")).not.toBe("exhausted");
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

// ── '있다/없다/모른다'를 가른다 ──────────────────────────────────────────────
import { interpretExistsProbe } from "../../tools/lib/tts-failure.mjs";

// 2026-09-05: 네트워크가 흔들리던 날 audioExists가 fetch 실패·타임아웃을 전부 '없음'으로 읽어,
//   **이미 오디오가 있는 45건**을 대상으로 골라 키 한도를 다시 만드는 데 태우려 했다.
//   '모른다'를 '없다'로 읽으면 있는 것을 또 만든다. 셋을 갈라야 한다.
describe("오디오 존재 확인 응답 해석", () => {
  it("200·206은 있음", () => {
    expect(interpretExistsProbe(200, null)).toBe("exists");
    expect(interpretExistsProbe(206, null)).toBe("exists");
  });
  it("503(서버가 '파일 없음'으로 쓰는 코드)·404는 없음", () => {
    expect(interpretExistsProbe(503, null)).toBe("missing");
    expect(interpretExistsProbe(404, null)).toBe("missing");
  });
  it("네트워크 오류·타임아웃·429·5xx(503 제외)는 모름 — 없음으로 읽지 않는다", () => {
    expect(interpretExistsProbe(null, new Error("fetch failed"))).toBe("unknown");
    expect(interpretExistsProbe(null, Object.assign(new Error("aborted"), { name: "TimeoutError" }))).toBe("unknown");
    expect(interpretExistsProbe(429, null)).toBe("unknown");
    expect(interpretExistsProbe(500, null)).toBe("unknown");
    expect(interpretExistsProbe(502, null)).toBe("unknown");
  });
});
