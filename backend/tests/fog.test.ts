import { describe, it, expect } from "vitest";
import { scoreSeaFog } from "../src/tour/fog";

describe("scoreSeaFog", () => {
  it("고습도+기온>수온+약풍+남풍 → 짙은 해무", () => {
    const r = scoreSeaFog({ reh: 96, airTemp: 27, waterTemp: 22, windSpeed: 4, windDir: 200 });
    expect(r.grade).toBe("짙은 해무");
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it("건조·맑음 → 양호", () => {
    const r = scoreSeaFog({ reh: 55, airTemp: 25, waterTemp: 24, windSpeed: 5, windDir: 320 });
    expect(r.grade).toBe("양호");
  });

  it("강풍은 해무를 흩어(감점)", () => {
    const calm = scoreSeaFog({ reh: 92, airTemp: 26, waterTemp: 22, windSpeed: 4, windDir: 200 });
    const windy = scoreSeaFog({ reh: 92, airTemp: 26, waterTemp: 22, windSpeed: 13, windDir: 200 });
    expect(windy.score).toBeLessThan(calm.score);
    expect(windy.reasons.join(" ")).toMatch(/바람/);
  });

  it("습도 지배 — 습도 높으면 이유에 표기", () => {
    const r = scoreSeaFog({ reh: 93, airTemp: 26, waterTemp: 22, windSpeed: 4, windDir: 200 });
    expect(r.reasons.join(" ")).toMatch(/습도/);
  });

  it("점수 0~100", () => {
    const r = scoreSeaFog({ reh: 100, airTemp: 30, waterTemp: 18, windSpeed: 3, windDir: 200 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
