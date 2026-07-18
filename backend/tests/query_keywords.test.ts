// AI 질의 RAG 검색 키워드 추출 — 조사 제거 + 지역어(태안/태안군) 희석 제거.
// 버그: "군의원들을"을 그대로 검색(23건 무관) + "태안군"을 OR로 넣어 bm25 순위 파괴(4만건 매칭).

import { describe, it, expect } from "vitest";

import { extractKeywords, ftsRankTokens } from "../src/query/keywords";

describe("extractKeywords — 조사 제거·불용어 제거", () => {
  it("'군의원들을' 같은 조사 붙은 토큰에서 조사를 떼어낸다", () => {
    const kw = extractKeywords("태안군 역대 군의원들을 알려줘");
    expect(kw).toContain("군의원");
    expect(kw).not.toContain("군의원들을");
    expect(kw).not.toContain("알려줘"); // 불용어
  });

  it("단어 끝 조사(가/에서 등)를 떼되 어간이 2글자 이상일 때만", () => {
    expect(extractKeywords("추이가 궁금해")).toContain("추이");
    expect(extractKeywords("안면도에서 뭐 볼까")).toContain("안면도");
  });

  it("복수형 '들'을 떼어낸다", () => {
    expect(extractKeywords("군의원들 명단")).toContain("군의원");
  });

  it("만(灣)·도(島)처럼 지명 끝 글자는 조사로 오인해 떼지 않는다", () => {
    expect(extractKeywords("가로림만 조력발전")).toContain("가로림만");
  });

  it("2글자 단어는 조사로 오인해 1글자로 만들지 않는다", () => {
    expect(extractKeywords("도로 상태")).toContain("도로");
  });
});

describe("ftsRankTokens — 지역어 희석 제거", () => {
  it("다른 키워드가 있으면 ubiquitous 지역어(태안/태안군)를 FTS에서 제외한다", () => {
    expect(ftsRankTokens(["태안군", "역대", "군의원"])).toEqual(["군의원"]);
    expect(ftsRankTokens(["태안", "가로림만"])).toEqual(["가로림만"]);
  });

  it("지역어만 있으면(다른 키워드 없음) 그대로 유지한다", () => {
    expect(ftsRankTokens(["태안군"])).toEqual(["태안군"]);
  });

  it("3글자 미만 토큰은 FTS 대상에서 제외한다(트라이그램 최소 3글자)", () => {
    // 토지(2)·시세(2)는 제외, 안면읍(3)만 남음
    expect(ftsRankTokens(["안면읍", "토지", "시세"])).toEqual(["안면읍"]);
  });
});
