import { describe, it, expect } from "vitest";

import { toCategoryCounts } from "../src/archive/router";

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
