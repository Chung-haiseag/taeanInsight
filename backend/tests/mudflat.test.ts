// 갯벌 물때 적기 — 조석(고저조)으로 조차·낮 간조·적기 점수 계산. 순수 함수 테스트.
//   큰 조차(사리)=갯벌 많이 드러남, 낮 시간 간조(저조)=체험 가능. 둘 다면 적기.

import { describe, it, expect } from "vitest";
import { tidalRangeM, daylightWindow, scoreMudflatDay } from "../src/tour/mudflat";

const EV = (time: string, type: "고조" | "저조", level: number) => ({ time, type, level });

describe("tidalRangeM", () => {
  it("최고 고조위 - 최저 저조위(cm)를 m로", () => {
    const r = tidalRangeM([EV("03:00", "고조", 720), EV("09:00", "저조", 60), EV("15:30", "고조", 700), EV("21:40", "저조", 90)]);
    expect(r).toBeCloseTo(6.6, 1); // (720-60)/100
  });
  it("레벨 없으면 null", () => {
    expect(tidalRangeM([{ time: "03:00", type: "고조", level: null }])).toBeNull();
  });
});

describe("daylightWindow", () => {
  it("여름은 넓고 겨울은 좁다", () => {
    expect(daylightWindow(7).start < daylightWindow(1).start).toBe(true);
    expect(daylightWindow(7).end > daylightWindow(1).end).toBe(true);
  });
});

describe("scoreMudflatDay", () => {
  const bigDaytime = [EV("04:00", "고조", 730), EV("10:30", "저조", 40), EV("16:40", "고조", 710), EV("22:50", "저조", 80)];
  it("큰 조차 + 낮 간조(저조 낮음) = 높은 점수·적기", () => {
    const d = scoreMudflatDay(bigDaytime, 7);
    expect(d.best).not.toBeNull();
    expect(d.best!.time).toBe("10:30"); // 낮 시간 저조
    expect(d.good).toBe(true);
    expect(d.score).toBeGreaterThanOrEqual(70);
    expect(d.tideLabel).toMatch(/큰물|사리/);
  });

  it("낮 간조가 없으면(밤에만 저조) 적기 아님", () => {
    const nightLows = [EV("06:00", "고조", 700), EV("03:30", "저조", 60), EV("18:30", "고조", 690), EV("23:40", "저조", 70)];
    const d = scoreMudflatDay(nightLows, 7);
    expect(d.good).toBe(false);
    expect(d.best).toBeNull();
  });

  it("작은 조차(조금)는 큰물보다 점수 낮음", () => {
    const neap = [EV("05:00", "고조", 500), EV("11:00", "저조", 250), EV("17:00", "고조", 480), EV("23:00", "저조", 270)];
    const big = scoreMudflatDay(bigDaytime, 7);
    const small = scoreMudflatDay(neap, 7);
    expect(small.score).toBeLessThan(big.score);
    expect(small.tideLabel).toMatch(/작은물|조금/);
  });
});
