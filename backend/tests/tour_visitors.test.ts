// 한국관광공사 방문자수 API 파싱 + 주말 실측(정답) 계산 — 순수 함수 테스트.
//   관광객 = 외지인(touDivCd=2) + 외국인(3). 현지인(1) 제외. 주말 실측 = 토+일 관광객 합.

import { describe, it, expect } from "vitest";

import {
  parseVisitorItems,
  filterSigngu,
  outsideByYmd,
  weekendActual,
  TAEAN_SIGNGU,
} from "../src/tour/visitors";

// 실제 API 응답 형태(발췌) — response.body.items.item[]
const SAMPLE = {
  response: {
    header: { resultCode: "0000", resultMsg: "OK" },
    body: {
      items: {
        item: [
          { signguCode: "44825", signguNm: "태안군", daywkDivCd: "6", daywkDivNm: "토요일", touDivCd: "1", touDivNm: "현지인(a)", touNum: "49805.0", baseYmd: "20260606" },
          { signguCode: "44825", signguNm: "태안군", daywkDivCd: "6", daywkDivNm: "토요일", touDivCd: "2", touDivNm: "외지인(b)", touNum: "91707.0", baseYmd: "20260606" },
          { signguCode: "44825", signguNm: "태안군", daywkDivCd: "6", daywkDivNm: "토요일", touDivCd: "3", touDivNm: "외국인(c)", touNum: "3184.46", baseYmd: "20260606" },
          { signguCode: "44210", signguNm: "서산시", daywkDivCd: "6", daywkDivNm: "토요일", touDivCd: "2", touDivNm: "외지인(b)", touNum: "12345.0", baseYmd: "20260606" },
        ],
      },
      numOfRows: 2000, pageNo: 1, totalCount: 4,
    },
  },
};

describe("parseVisitorItems", () => {
  it("응답 봉투에서 방문자 행을 뽑고 touNum을 숫자로 변환한다", () => {
    const rows = parseVisitorItems(SAMPLE);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({ baseYmd: "20260606", signguCode: "44825", touDivCd: "2", touNum: 91707, daywkCd: "6" });
    expect(typeof rows[2].touNum).toBe("number");
    expect(rows[2].touNum).toBeCloseTo(3184.46, 2);
  });

  it("item이 단일 객체여도 배열로 처리한다", () => {
    const one = { response: { body: { items: { item: { signguCode: "44825", touDivCd: "2", touNum: "100", baseYmd: "20260601", daywkDivCd: "1" } } } } };
    expect(parseVisitorItems(one)).toHaveLength(1);
  });

  it("결과 없음/오류 응답이면 빈 배열", () => {
    expect(parseVisitorItems({ response: { body: { items: "" } } })).toEqual([]);
    expect(parseVisitorItems({ resultCode: "10", resultMsg: "INVALID" })).toEqual([]);
    expect(parseVisitorItems(null)).toEqual([]);
  });
});

describe("filterSigngu", () => {
  it("태안(44825) 행만 남긴다", () => {
    const taean = filterSigngu(parseVisitorItems(SAMPLE), TAEAN_SIGNGU);
    expect(taean).toHaveLength(3);
    expect(taean.every((r) => r.signguCode === "44825")).toBe(true);
  });
});

describe("outsideByYmd", () => {
  it("외지인+외국인만 합산(현지인 제외)해 날짜별 맵을 만든다", () => {
    const taean = filterSigngu(parseVisitorItems(SAMPLE), TAEAN_SIGNGU);
    const m = outsideByYmd(taean);
    // 91707(외지인) + 3184.46(외국인) = 94891.46
    expect(m.get("20260606")).toBeCloseTo(94891.46, 1);
    expect(m.size).toBe(1);
  });
});

describe("weekendActual", () => {
  it("토·일 관광객 합을 반올림해 반환한다", () => {
    const outside = new Map([["20260606", 94891.46], ["20260607", 80000]]);
    expect(weekendActual("2026-06-06", outside)).toBe(174891);
  });

  it("일요일 데이터가 없으면(미갱신) null", () => {
    const outside = new Map([["20260606", 94891.46]]);
    expect(weekendActual("2026-06-06", outside)).toBeNull();
  });
});
