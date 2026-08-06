import { describe, it, expect } from "vitest";
import { fishOutlook } from "../src/tour/auction_forecast";

describe("fishOutlook", () => {
  it("값 15%+ 상승 → 강세", () => {
    const r = fishOutlook(0, 20);
    expect(r.tone).toBe("up");
    expect(r.label).toMatch(/강세|오름/);
  });
  it("값 15%+ 하락 → 약세(지금 유리)", () => {
    const r = fishOutlook(0, -20);
    expect(r.tone).toBe("down");
    expect(r.label).toMatch(/약세/);
  });
  it("값 보합인데 물량 급증 → 안정세", () => {
    const r = fishOutlook(40, 3);
    expect(r.tone).toBe("flat");
    expect(r.label).toMatch(/안정|늘/);
  });
  it("값 보합인데 물량 급감 → 강보합", () => {
    const r = fishOutlook(-40, 2);
    expect(r.tone).toBe("up");
  });
  it("비교 데이터 없으면 flat/신규", () => {
    expect(fishOutlook(null, null).tone).toBe("flat");
  });
  it("값 변화 작고 물량도 작으면 보합", () => {
    expect(fishOutlook(5, 4).label).toBe("보합");
  });
});
