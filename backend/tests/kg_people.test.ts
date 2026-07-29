import { describe, it, expect } from "vitest";
import { isHub, rankCoappears, yearHistogram, topTopics, HUB_MENTIONS } from "../src/kg/people";

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

describe("topTopics", () => {
  const titles = [
    "가세로 군수 해양신도시 착공",
    "해양신도시 예산 확보",
    "해양신도시 주민설명회",
    "가세로 태안군 방문",   // '태안군'은 UBIQUITOUS 제외, '가세로'는 본인 이름 제외
    "관광 활성화 대책",
  ];
  it("제목 2회 이상 키워드를 빈도순으로, 본인이름·지역명 제외", () => {
    const r = topTopics(titles, "가세로");
    expect(r[0]).toEqual({ term: "해양신도시", count: 3 });
    expect(r.some((t) => t.term === "가세로")).toBe(false);   // 본인 이름 제외
    expect(r.some((t) => t.term === "태안군")).toBe(false);   // 지역명 제외
    expect(r.some((t) => t.term === "관광")).toBe(false);     // 1회는 제외(count>=2)
  });
  it("빈 입력 안전", () => { expect(topTopics([], "홍길동")).toEqual([]); });
});
