// 관련 뉴스 — 제목 키워드 뽑기 + FTS 질의 만들기.
//   2026-10-17 사고: `title LIKE '%키워드%'` 풀스캔이 **하루 3억 8,620만 행**을 읽어 D1 이 넘어갔고
//   /news 가 500 을 뱉었다. 같은 COUNT 를 두 번 돌리는 군더더기까지 있었다.
//   트라이그램 FTS(제목 색인)는 같은 일을 7천 행·20ms 로 한다 — 다만 **3글자부터**.
import { describe, expect, it } from "vitest";

import { FTS_MIN, relatedKeywords, titleMatchQuery } from "../src/archive/related";

describe("relatedKeywords — 제목에서 뽑는 관련 키워드", () => {
  it("긴 단어(더 고유한 복합명사)를 먼저, 최대 3개", () => {
    expect(relatedKeywords("가로림만 조력발전소 건설 백지화 촉구 집회")).toEqual(["조력발전소", "가로림만", "백지화"]);
  });
  it("흔한 말(추진·사업·태안군…)은 뺀다", () => {
    expect(relatedKeywords("태안군 해양쓰레기 수거 사업 추진")).toEqual(["해양쓰레기", "수거"]);
  });
  it("한 글자와 숫자로 시작하는 토막은 뺀다", () => {
    expect(relatedKeywords("7월 1일부터 안면도 꽃지해변 개장")).toEqual(["꽃지해변", "안면도", "개장"]);
  });
  it("같은 말이 두 번 나와도 한 번만", () => {
    expect(relatedKeywords("안면도 안면도 관광")).toEqual(["안면도", "관광"]);
  });
  it("제목이 비면 빈 목록", () => {
    expect(relatedKeywords("")).toEqual([]);
    expect(relatedKeywords("· , .")).toEqual([]);
  });
});

describe("titleMatchQuery — FTS5 제목 질의", () => {
  it("제목 칸만, OR 로 묶는다", () => {
    expect(titleMatchQuery(["꽃지해변", "안면도"])).toBe('title:"꽃지해변" OR title:"안면도"');
  });
  it("따옴표는 두 번 적어 질의가 깨지지 않게 한다", () => {
    expect(titleMatchQuery(['그 "말"'])).toBe('title:"그 ""말"""');
  });
  it("키워드가 없으면 빈 문자열", () => {
    expect(titleMatchQuery([])).toBe("");
  });
});

describe("FTS_MIN — 트라이그램이 매칭하는 최소 길이", () => {
  it("3글자", () => {
    expect(FTS_MIN).toBe(3);
  });
  // ⚠ 2글자 키워드로 FTS 를 치면 **0건**이 나온다(트라이그램이 색인하지 못함).
  //   그래서 2글자뿐인 제목(표본 600건 중 8.8%)은 풀스캔 대신 **같은 분류**로 넘긴다.
  it("3글자 미만만 남는 제목은 FTS 로 찾을 수 없다", () => {
    const kws = relatedKeywords("농협, 배추 판매");
    expect(kws.every((k) => k.length < FTS_MIN)).toBe(true);
  });
});
