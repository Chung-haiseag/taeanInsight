import { describe, it, expect } from "vitest";
import { scoreSunset } from "../src/tour/sunset";

describe("scoreSunset", () => {
  it("구름많음+청명(낮은 미세먼지·습도) → 환상적", () => {
    const r = scoreSunset({ sky: "구름많음", pty: null, reh: 55, pm10: 20 });
    expect(r.grade).toBe("환상적");
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  it("비 오면 기대난망(대폭 감점)", () => {
    const r = scoreSunset({ sky: "구름많음", pty: "비", reh: 90, pm10: 40 });
    expect(r.grade).toBe("기대난망");
    expect(r.reasons.join(" ")).toMatch(/비|강수/);
  });

  it("흐림은 낮은 등급", () => {
    const r = scoreSunset({ sky: "흐림", pty: null, reh: 70, pm10: 40 });
    expect(["흐림", "기대난망"]).toContain(r.grade);
  });

  it("맑음은 구름많음보다 낮다(밋밋)", () => {
    const clear = scoreSunset({ sky: "맑음", pty: null, reh: 55, pm10: 20 });
    const cloudy = scoreSunset({ sky: "구름많음", pty: null, reh: 55, pm10: 20 });
    expect(clear.score).toBeLessThan(cloudy.score);
  });

  it("미세먼지 매우 나쁨은 감점(뿌옇)", () => {
    const clean = scoreSunset({ sky: "구름많음", pty: null, reh: 55, pm10: 20 });
    const dusty = scoreSunset({ sky: "구름많음", pty: null, reh: 55, pm10: 160 });
    expect(dusty.score).toBeLessThan(clean.score);
    expect(dusty.reasons.join(" ")).toMatch(/미세먼지/);
  });

  it("점수는 0~100", () => {
    const r = scoreSunset({ sky: "흐림", pty: "비", reh: 95, pm10: 200 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
