import { describe, it, expect } from "vitest";
import { scoreFireRisk } from "../src/tour/fire_risk";

describe("scoreFireRisk", () => {
  it("건조특보+저습도+강풍+봄 → 매우높음", () => {
    const r = scoreFireRisk({ reh: 20, windSpeed: 10, dryAlert: true, month: 4 });
    expect(r.level).toBe("매우높음");
    expect(r.reasons.join(" ")).toMatch(/건조특보/);
  });
  it("여름 고습도 무풍 → 낮음", () => {
    expect(scoreFireRisk({ reh: 85, windSpeed: 1, dryAlert: false, month: 7 }).level).toBe("낮음");
  });
  it("건조특보 발효면 최소 높음 이상", () => {
    const r = scoreFireRisk({ reh: 45, windSpeed: 3, dryAlert: true, month: 11 });
    expect(["높음", "매우높음"]).toContain(r.level);
  });
  it("건조·강풍이 이유에 표기", () => {
    const r = scoreFireRisk({ reh: 22, windSpeed: 10, dryAlert: false, month: 3 });
    expect(r.reasons.join(" ")).toMatch(/건조|강풍/);
  });
  it("점수 0~100", () => {
    const r = scoreFireRisk({ reh: 10, windSpeed: 15, dryAlert: true, month: 4 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
