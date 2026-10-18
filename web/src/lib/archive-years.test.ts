import { describe, it, expect } from "vitest";

import { summarizeYears, barHeights, decadeTicks, type YearCount } from "./archive-years";

// 뉴스아카이브 머리칸의 '36년 막대'. 지어내지 않는다 — 값이 없으면 막대도 없다.
const sample: YearCount[] = [
  { year: 1990, n: 120 }, { year: 1991, n: 0 }, { year: 1992, n: 400 }, { year: 1993, n: 200 },
];

describe("summarizeYears", () => {
  it("범위·햇수·가장 많은 해·합계를 뽑는다", () => {
    expect(summarizeYears(sample)).toEqual({
      from: 1990, to: 1993, span: 4, total: 720, peak: { year: 1992, n: 400 },
    });
  });

  it("햇수는 양끝을 포함해 센다 — 1990~2026 은 37년", () => {
    const span = summarizeYears([{ year: 1990, n: 1 }, { year: 2026, n: 1 }])?.span;
    expect(span).toBe(37);
  });

  it("같은 수면 앞선 해를 가장 많은 해로", () => {
    expect(summarizeYears([{ year: 1990, n: 5 }, { year: 1991, n: 5 }])?.peak).toEqual({ year: 1990, n: 5 });
  });

  it("전부 0이면 가장 많은 해는 없다 — 0건을 최고라 부르지 않는다", () => {
    expect(summarizeYears([{ year: 1990, n: 0 }, { year: 1991, n: 0 }])?.peak).toBeNull();
  });

  it("빈 입력은 null", () => expect(summarizeYears([])).toBeNull());
});

describe("barHeights — 가장 많은 해를 꽉 채운 비율로", () => {
  it("최고 해가 maxPx, 나머지는 비율", () => {
    expect(barHeights(sample, 100, 0)).toEqual([30, 0, 100, 50]);
  });

  it("0 아닌 해는 눈에 보이게 최소 높이를 준다 — 0인 해는 그대로 0", () => {
    expect(barHeights([{ year: 1990, n: 1 }, { year: 1991, n: 0 }, { year: 1992, n: 1000 }], 100, 3))
      .toEqual([3, 0, 100]);
  });

  it("전부 0이면 전부 0 — 0으로 나누지 않는다", () => {
    expect(barHeights([{ year: 1990, n: 0 }, { year: 1991, n: 0 }], 100, 3)).toEqual([0, 0]);
  });

  it("빈 입력은 빈 배열", () => expect(barHeights([], 100)).toEqual([]));
});

describe("decadeTicks — 가로축에 십년 단위만", () => {
  it("범위 안의 10으로 끝나는 해", () => {
    expect(decadeTicks([{ year: 1990, n: 1 }, { year: 2026, n: 1 }])).toEqual([1990, 2000, 2010, 2020]);
  });

  it("범위가 좁아 십년 눈금이 없으면 빈 배열", () => {
    expect(decadeTicks([{ year: 2021, n: 1 }, { year: 2026, n: 1 }])).toEqual([]);
  });

  it("빈 입력은 빈 배열", () => expect(decadeTicks([])).toEqual([]));
});
