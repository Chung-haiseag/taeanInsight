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

import { listUrl, listStateFrom, scrollKey } from "./newsarchive-helpers";

// 3페이지에서 기사를 열고 뒤로 오면 1페이지로 돌아갔다 — 검색어·페이지가 주소에 없었다.
describe("목록 상태를 주소에 담기", () => {
  it("기본값은 적지 않는다 — 주소가 짧아야 공유하기도 좋다", () => {
    expect(listUrl({ q: "", cat: "all", year: "", page: 1 })).toBe("/news");
  });

  it("검색어·분류·연도·페이지를 담는다", () => {
    expect(listUrl({ q: "해경", cat: "industry", year: "2011", page: 3 }))
      .toBe("/news?q=%ED%95%B4%EA%B2%BD&cat=industry&year=2011&page=3");
  });

  it("1페이지는 적지 않는다", () => {
    expect(listUrl({ q: "해경", cat: "all", year: "", page: 1 })).toBe("/news?q=%ED%95%B4%EA%B2%BD");
  });
});

describe("주소에서 목록 상태 읽기", () => {
  const from = (o: Record<string, string>) => listStateFrom((k) => o[k] ?? null);

  it("적힌 대로 되살린다", () => {
    expect(from({ q: "해경", cat: "industry", year: "2011", page: "3" }))
      .toEqual({ q: "해경", cat: "industry", year: "2011", page: 3 });
  });

  it("아무것도 없으면 기본값", () => {
    expect(from({})).toEqual({ q: "", cat: "all", year: "", page: 1 });
  });

  it("이상한 값은 기본값으로 되돌린다 — 주소는 남이 고칠 수 있다", () => {
    expect(from({ page: "-3", year: "abcd" })).toMatchObject({ page: 1, year: "" });
    expect(from({ page: "여덟" })).toMatchObject({ page: 1 });
  });
});

describe("스크롤 위치 열쇠", () => {
  it("검색·페이지가 같아야 같은 열쇠", () => {
    const a = { q: "해경", cat: "all", year: "", page: 3 };
    expect(scrollKey(a)).toBe(scrollKey({ ...a }));
  });

  // 다른 검색인데 옛 위치로 내려가면 엉뚱한 자리에 떨어진다.
  it("검색어나 페이지가 다르면 다른 열쇠", () => {
    const a = { q: "해경", cat: "all", year: "", page: 3 };
    expect(scrollKey(a)).not.toBe(scrollKey({ ...a, page: 4 }));
    expect(scrollKey(a)).not.toBe(scrollKey({ ...a, q: "군수" }));
  });
});
