import { describe, it, expect } from "vitest";

import { estimatePct, stageForPct } from "./search-progress";

describe("estimatePct", () => {
  it("0초는 0%", () => {
    expect(estimatePct(0)).toBe(0);
  });
  it("시간이 지날수록 단조 증가한다", () => {
    expect(estimatePct(3000)).toBeGreaterThan(estimatePct(0));
    expect(estimatePct(15000)).toBeGreaterThan(estimatePct(3000));
    expect(estimatePct(45000)).toBeGreaterThan(estimatePct(15000));
  });
  it("실제 완료 전까지 95%를 넘지 않는다(가짜 100% 방지)", () => {
    expect(estimatePct(60000)).toBeLessThanOrEqual(95);
    expect(estimatePct(600000)).toBeLessThanOrEqual(95);
  });
  it("초반이 후반보다 빠르게 오른다(감속)", () => {
    const first5 = estimatePct(5000) - estimatePct(0);
    const late5 = estimatePct(45000) - estimatePct(40000);
    expect(first5).toBeGreaterThan(late5);
  });
});

describe("stageForPct", () => {
  it("낮은 %는 초기 단계, 높은 %는 '답변 작성'(마지막)", () => {
    expect(stageForPct(0)).toBe(0);
    expect(stageForPct(20)).toBe(1);
    expect(stageForPct(50)).toBe(4);
    expect(stageForPct(95)).toBe(4);
  });
  it("단계는 %에 대해 단조 비감소", () => {
    let prev = -1;
    for (let p = 0; p <= 95; p += 5) {
      const s = stageForPct(p);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});
