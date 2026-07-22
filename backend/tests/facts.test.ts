// 큐레이션 사실 매칭 — 질의에 사실의 키워드가 있으면 매칭(히트 수 순). 순수 함수.

import { describe, it, expect } from "vitest";

import { matchFacts, type Fact } from "../src/query/facts";

const FACTS: Fact[] = [
  { id: "islands", keywords: "섬 도서 유인도 무인도", title: "태안 섬", content: "태안군 섬 119개...", source: "태안군" },
  { id: "chiefs", keywords: "역대 군수 군수 민선", title: "역대 태안군수", content: "역대 군수...", source: "태안군청" },
];

describe("matchFacts", () => {
  it("질의에 사실 키워드가 있으면 매칭한다", () => {
    const m = matchFacts("태안군에 소속된 섬의 갯수와 이름은", FACTS);
    expect(m.map((f) => f.id)).toEqual(["islands"]);
  });

  it("여러 키워드가 맞으면 히트 수 많은 순", () => {
    // '역대'와 '군수' 둘 다 맞는 chiefs가 상위
    const m = matchFacts("역대 태안 군수 명단", FACTS);
    expect(m[0].id).toBe("chiefs");
  });

  it("매칭 키워드 없으면 빈 배열", () => {
    expect(matchFacts("오늘 날씨 어때", FACTS)).toEqual([]);
  });

  it("max로 상한", () => {
    const m = matchFacts("섬 유인도 역대 군수", FACTS, 1);
    expect(m).toHaveLength(1);
  });
});
