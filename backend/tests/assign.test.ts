import { describe, it, expect } from "vitest";
import { coverageAssignMessage } from "../src/reporter/assign";

describe("coverageAssignMessage", () => {
  it("개월 단위 공백 표기", () => {
    const m = coverageAssignMessage("가로림만 조력발전", 200);
    expect(m.title).toBe("📡 취재 배정: 가로림만 조력발전");
    expect(m.body).toContain("7개월 무보도");
    expect(m.body).toContain("후속취재 요청");
  });
  it("년 단위·메모 포함", () => {
    const m = coverageAssignMessage("해양치유센터", 800, "예산 확인 필요");
    expect(m.body).toContain("2.2년 무보도");
    expect(m.body).toContain("예산 확인 필요");
  });
  it("무보도(null)·일 단위", () => {
    expect(coverageAssignMessage("X", null).body).toContain("장기 무보도");
    expect(coverageAssignMessage("Y", 10).body).toContain("10일 무보도");
  });
});
