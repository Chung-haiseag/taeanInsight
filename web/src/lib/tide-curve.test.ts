import { describe, expect, it } from "vitest";

import { describeTide, extremesOf, levelAt, tideChart, toMinutes, type TideEvent } from "./tide-curve";

const DAY: TideEvent[] = [
  { time: "05:12", type: "고조", level: 612 },
  { time: "11:34", type: "저조", level: 98 },
  { time: "17:41", type: "고조", level: 640 },
  { time: "23:58", type: "저조", level: 105 },
];

describe("toMinutes", () => {
  it("HH:MM을 분으로", () => {
    expect(toMinutes("05:12")).toBe(312);
    expect(toMinutes("0:00")).toBe(0);
  });
  it("형식이 틀리면 null", () => {
    expect(toMinutes("25:00")).toBeNull();
    expect(toMinutes("오전 5시")).toBeNull();
  });
});

describe("levelAt", () => {
  const ext = extremesOf(DAY);
  it("극값 시각에서는 그 조위", () => {
    expect(levelAt(ext, 312)).toBeCloseTo(612);
    expect(levelAt(ext, 694)).toBeCloseTo(98);
  });
  it("극값 사이는 두 값 사이", () => {
    const mid = levelAt(ext, 500)!;
    expect(mid).toBeLessThan(612);
    expect(mid).toBeGreaterThan(98);
  });
  it("앞뒤를 덧대 0시·24시도 채운다", () => {
    expect(levelAt(ext, 0)).not.toBeNull();
    expect(levelAt(ext, 1440)).not.toBeNull();
  });
});

describe("tideChart", () => {
  it("조위가 없으면 그리지 않는다", () => {
    expect(tideChart([{ time: "05:12", type: "고조", level: null }], 600)).toBeNull();
  });
  it("지금 물이 드는지 빠지는지 안다", () => {
    expect(tideChart(DAY, 900)!.now!.rising).toBe(true); // 15시 — 17:41 만조로 가는 중
    expect(tideChart(DAY, 1330)!.now!.rising).toBe(false); // 22:10 — 23:58 간조로 가는 중
  });
  it("만조가 간조보다 위(y가 작다)", () => {
    const g = tideChart(DAY, null)!;
    const hi = g.marks.find((m) => m.type === "고조")!;
    const lo = g.marks.find((m) => m.type === "저조")!;
    expect(hi.y).toBeLessThan(lo.y);
  });
});

describe("describeTide", () => {
  it("극값과 지금 상태를 문장으로", () => {
    const g = tideChart(DAY, 1330)!;
    const s = describeTide(DAY, g.now, "오후 10시 10분");
    expect(s).toContain("05:12 만조 612센티미터");
    expect(s).toContain("빠지는 중");
  });
});
