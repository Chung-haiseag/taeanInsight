import { describe, it, expect } from "vitest";
import { seasonalSpecies, scoreFishingDay } from "../src/tour/fishing";

describe("seasonalSpecies", () => {
  it("우럭은 연중(1·7월 모두)", () => {
    expect(seasonalSpecies(1)).toContain("우럭");
    expect(seasonalSpecies(7)).toContain("우럭");
  });
  it("가을(10월) 주꾸미 시즌", () => expect(seasonalSpecies(10)).toContain("주꾸미"));
  it("봄(5월) 갑오징어 시즌", () => expect(seasonalSpecies(5)).toContain("갑오징어"));
  it("주꾸미는 봄(4월)엔 제철 아님", () => expect(seasonalSpecies(4)).not.toContain("주꾸미"));
});

describe("scoreFishingDay", () => {
  const calm = { waveHeight: 0.3, windSpeed: 3, tideRange: 4, waterTemp: 20, pop: 0, warningActive: false, species: ["우럭"] };

  it("잔잔·미풍·중물때·제철 → 최적(≥75)", () => {
    const r = scoreFishingDay(calm);
    expect(r.grade).toBe("최적");
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  it("파고 2.5m → 출조자제", () => {
    const r = scoreFishingDay({ ...calm, waveHeight: 2.5 });
    expect(r.grade).toBe("출조자제");
    expect(r.reasons.join(" ")).toMatch(/파고/);
  });

  it("풍랑·강풍 특보 발효면 무조건 출조자제", () => {
    const r = scoreFishingDay({ ...calm, warningActive: true });
    expect(r.grade).toBe("출조자제");
    expect(r.reasons.join(" ")).toMatch(/특보/);
  });

  it("강풍(12m/s)은 잔잔 대비 감점", () => {
    expect(scoreFishingDay({ ...calm, windSpeed: 12 }).score).toBeLessThan(scoreFishingDay(calm).score);
  });

  it("파고 정보 없으면 이유에 표기", () => {
    const r = scoreFishingDay({ ...calm, waveHeight: null });
    expect(r.reasons.join(" ")).toMatch(/파고/);
  });

  it("점수는 0~100로 제한", () => {
    const bad = scoreFishingDay({ waveHeight: 3, windSpeed: 15, tideRange: 7, waterTemp: 3, pop: 90, warningActive: true, species: [] });
    expect(bad.score).toBeGreaterThanOrEqual(0);
    expect(bad.score).toBeLessThanOrEqual(100);
  });
});
