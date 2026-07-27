import { describe, it, expect } from "vitest";
import { isHub, rankCoappears, yearHistogram, HUB_MENTIONS } from "../src/kg/people";

describe("isHub", () => {
  it("임계 경계(>=5000)", () => {
    expect(HUB_MENTIONS).toBe(5000);
    expect(isHub(4999)).toBe(false);
    expect(isHub(5000)).toBe(true);
    expect(isHub(17835)).toBe(true);
  });
});

describe("rankCoappears", () => {
  const rows = [
    { otherId: "p:a", count: 5 },
    { otherId: "p:hub", count: 999 },
    { otherId: "p:b", count: 9 },
    { otherId: "p:c", count: 9 },
  ];
  it("바이라인 제외 + count 내림차순(동률 otherId)", () => {
    const r = rankCoappears(rows, new Set(["p:hub"]), 10);
    expect(r.map((x) => x.otherId)).toEqual(["p:b", "p:c", "p:a"]);
  });
  it("limit 상한", () => {
    expect(rankCoappears(rows, new Set(["p:hub"]), 2).map((x) => x.otherId)).toEqual(["p:b", "p:c"]);
  });
  it("빈 입력·null 안전", () => {
    expect(rankCoappears([], new Set(), 5)).toEqual([]);
    expect(rankCoappears(undefined as unknown as [], new Set(), 5)).toEqual([]);
  });
});

describe("yearHistogram", () => {
  it("연도 오름차순, null/비유효 연도 skip", () => {
    const r = yearHistogram([
      { year: 2003, count: 4 },
      { year: null, count: 7 },
      { year: 1999, count: 2 },
    ]);
    expect(r).toEqual([{ year: 1999, count: 2 }, { year: 2003, count: 4 }]);
  });
  it("빈 배열", () => { expect(yearHistogram([])).toEqual([]); });
});
