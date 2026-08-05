import { describe, it, expect } from "vitest";
import { seasonalCalendar, peakStatus } from "../src/tour/seasonal";

describe("peakStatus", () => {
  it("성수기 월이면 성수기", () => expect(peakStatus([9, 10], 10)).toBe("성수기"));
  it("성수기 직전달이면 제철임박", () => expect(peakStatus([9, 10], 8)).toBe("제철임박"));
  it("그 외는 비성수기", () => expect(peakStatus([9, 10], 3)).toBe("비성수기"));
  it("연말·연초 경계도 임박 인식(1월 성수기의 12월)", () => expect(peakStatus([1, 2], 12)).toBe("제철임박"));
});

describe("seasonalCalendar", () => {
  it("이번 달 제철·다가오는 제철을 분류", () => {
    const cal = seasonalCalendar(10, {});
    const now = cal.filter((c) => c.status === "성수기").map((c) => c.name);
    expect(now).toContain("대하"); // 9~10월 성수기
    expect(now).toContain("꽃게"); // 가을 성수기
  });
  it("현재 경락가를 어종에 매칭(부분일치)", () => {
    const cal = seasonalCalendar(10, { "꽃게": 16000, "살오징어": 4000 });
    const crab = cal.find((c) => c.name === "꽃게");
    expect(crab?.pricePerKg).toBe(16000);
  });
  it("성수기 우선 정렬", () => {
    const cal = seasonalCalendar(10, {});
    const firstPeakIdx = cal.findIndex((c) => c.status === "성수기");
    const firstNonPeakIdx = cal.findIndex((c) => c.status !== "성수기");
    expect(firstPeakIdx).toBeLessThan(firstNonPeakIdx);
  });
});
