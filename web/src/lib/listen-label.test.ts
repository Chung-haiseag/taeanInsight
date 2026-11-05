// 듣기 단추에 무엇을 듣는지 적는다.
//   2026-11-06 사용자 화면: '오늘의 브리핑' 카드의 단추가 "기사 듣기"라고 적혀 있었다.
//   브리핑 카드는 title="브리핑 듣기" 를 넘기고 있었지만 줄 안(inline) 모양이 그 값을 버리고
//   늘 "기사 듣기"를 찍었다 — 기사가 아닌 것을 기사라고 부르고 있었다.
import { describe, expect, it } from "vitest";

import { listenLabel } from "./listen-label";

describe("listenLabel — 듣기 단추에 적을 말", () => {
  it("줄 안 단추는 넘겨준 이름을 쓴다", () => {
    expect(listenLabel("inline", "브리핑 듣기")).toBe("브리핑 듣기");
  });
  it("이름이 없으면 기사 낭독으로 본다", () => {
    expect(listenLabel("inline")).toBe("기사 듣기");
    expect(listenLabel("inline", "   ")).toBe("기사 듣기");
  });
  it("카드 모양은 제목이 따로 있으니 단추는 짧게", () => {
    expect(listenLabel("card", "브리핑 듣기")).toBe("듣기");
    expect(listenLabel("card")).toBe("듣기");
  });
});
