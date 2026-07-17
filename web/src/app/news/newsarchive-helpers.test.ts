import { describe, it, expect } from "vitest";

import { CATEGORY_ORDER, sortCategoryTabs } from "./newsarchive-helpers";

describe("sortCategoryTabs", () => {
  it("관심분야 카테고리를 앞으로 정렬", () => {
    expect(sortCategoryTabs(CATEGORY_ORDER, ["policy", "culture"]).slice(0, 2)).toEqual(["policy", "culture"]);
  });

  it("관심분야가 없으면 원래 순서 유지", () => {
    expect(sortCategoryTabs(CATEGORY_ORDER, [])).toEqual([...CATEGORY_ORDER]);
  });

  it("그룹 내 원래 순서를 보존(안정 정렬)", () => {
    expect(sortCategoryTabs(CATEGORY_ORDER, ["environment"])).toEqual([
      "environment",
      "tourism",
      "industry",
      "policy",
      "realestate",
      "culture",
      "society",
    ]);
  });
});
