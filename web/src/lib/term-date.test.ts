import { describe, it, expect } from "vitest";
import { formatTermDate, formatTermRange } from "./term-date";

// 왜 두 가지 정밀도를 함께 다루는가:
//   관선 군수(1~6대)의 공식 명부는 **월 단위**다 — `1대(1989.1~1989.11)`.
//   db/064가 이를 '그 달 1일~말일'로 펼치면서 1대 종료(11-30)와 2대 시작(11-01)이
//   30일 겹쳤다. 한 자리에 두 사람이 앉을 수는 없다(2026-08-31 정합성 점검).
//   민선(7대~)은 임기가 법으로 정해져 일 단위가 정확하다. 둘을 섞어 적되 읽히게 만든다.
describe("재임 기간 표기", () => {
  it("월 단위는 월까지만 적는다 — 없는 날짜를 지어내지 않는다", () => {
    expect(formatTermDate("1989-11")).toBe("1989년 11월");
    expect(formatTermDate("1991-01")).toBe("1991년 1월");
  });

  it("일 단위는 날짜까지 적는다", () => {
    expect(formatTermDate("1995-07-01")).toBe("1995년 7월 1일");
    expect(formatTermDate("2026-06-30")).toBe("2026년 6월 30일");
  });

  it("연도만 있으면 연도만", () => {
    expect(formatTermDate("1989")).toBe("1989년");
  });

  it("빈 값은 빈 문자열", () => {
    expect(formatTermDate(null)).toBe("");
    expect(formatTermDate("")).toBe("");
    expect(formatTermDate("알 수 없음")).toBe("알 수 없음");
  });

  it("기간은 물결로 잇는다", () => {
    expect(formatTermRange("1989-11", "1991-01")).toBe("1989년 11월 ~ 1991년 1월");
    expect(formatTermRange("1995-07-01", "1998-06-30")).toBe("1995년 7월 1일 ~ 1998년 6월 30일");
  });

  it("끝이 비면 '현재'로 — 재임 중이라는 뜻이다", () => {
    expect(formatTermRange("2026-07-01", null)).toBe("2026년 7월 1일 ~ 현재");
  });

  it("시작이 없으면 빈 문자열 — 반쪽짜리를 억지로 그리지 않는다", () => {
    expect(formatTermRange(null, "1991-01")).toBe("");
  });
});
