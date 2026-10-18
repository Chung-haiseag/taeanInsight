import { describe, it, expect } from "vitest";

import { toCategoryCounts, toYearCounts } from "../src/archive/router";

describe("toCategoryCounts", () => {
  it("행 배열을 카테고리→건수 맵으로 변환", () => {
    expect(
      toCategoryCounts([
        { category: "tourism", n: 8231 },
        { category: "environment", n: 6540 },
      ]),
    ).toEqual({ tourism: 8231, environment: 6540 });
  });

  it("빈/누락 카테고리 행은 건너뛴다", () => {
    expect(toCategoryCounts([{ category: "", n: 5 }, { category: "policy", n: 3 }])).toEqual({ policy: 3 });
  });

  it("빈 배열은 빈 객체", () => {
    expect(toCategoryCounts([])).toEqual({});
  });
});

// ── 연도별 기사 수 (2026-10-13) ──
//   뉴스아카이브 머리칸에 '36년의 두께'를 막대로 보여주려고 넣었다. 빈 해도 자리를 지켜야
//   가로축이 연도와 맞는다 — 건너뛰면 1990~2026이 아니라 '값 있는 해'만 늘어서 축이 거짓이 된다.
describe("toYearCounts — 연도별 기사 수를 빈 해까지 채워 돌려준다", () => {
  it("minYear~maxYear 를 빠짐없이, 없는 해는 0", () => {
    expect(toYearCounts([{ year: 1990, n: 12 }, { year: 1992, n: 30 }], 1990, 1992)).toEqual([
      { year: 1990, n: 12 },
      { year: 1991, n: 0 },
      { year: 1992, n: 30 },
    ]);
  });

  it("연도 순으로 정렬한다 — DB가 뒤섞어 줘도", () => {
    expect(toYearCounts([{ year: 1992, n: 3 }, { year: 1990, n: 1 }], 1990, 1992).map((x) => x.year))
      .toEqual([1990, 1991, 1992]);
  });

  it("범위 밖 해는 버린다", () => {
    expect(toYearCounts([{ year: 1989, n: 9 }, { year: 1990, n: 1 }], 1990, 1990)).toEqual([{ year: 1990, n: 1 }]);
  });

  it("범위를 모르면 빈 배열 — 지어내지 않는다", () => {
    expect(toYearCounts([{ year: 1990, n: 1 }], null, null)).toEqual([]);
    expect(toYearCounts([], 1990, 1992)).toEqual([]);
  });

  it("거꾸로 된 범위도 빈 배열", () => {
    expect(toYearCounts([{ year: 1990, n: 1 }], 2000, 1990)).toEqual([]);
  });
});
