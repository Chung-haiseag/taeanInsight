import { describe, it, expect } from "vitest";
import { cityGrade, latestByDate } from "../src/tour/dust";

describe("cityGrade", () => {
  it("시도 등급 추출", () => expect(cityGrade("서울 : 좋음,충남 : 보통,경기 : 좋음", "충남")).toBe("보통"));
  it("공백 변형도 파싱", () => expect(cityGrade("충남 :나쁨, 대전 : 보통", "충남")).toBe("나쁨"));
  it("없으면 null", () => expect(cityGrade("서울 : 좋음", "충남")).toBeNull());
  it("빈 입력 null", () => expect(cityGrade(undefined, "충남")).toBeNull());
});

describe("latestByDate", () => {
  it("예보대상일별 최신 발표만 채택", () => {
    const items = [
      { informData: "2026-08-06", dataTime: "2026-08-06 05:00", informGrade: "충남 : 좋음" },
      { informData: "2026-08-06", dataTime: "2026-08-06 17:00", informGrade: "충남 : 보통" },
      { informData: "2026-08-07", dataTime: "2026-08-06 17:00", informGrade: "충남 : 나쁨" },
    ];
    const r = latestByDate(items);
    expect(r["2026-08-06"].informGrade).toContain("보통"); // 17시 발표 우선
    expect(r["2026-08-07"].informGrade).toContain("나쁨");
  });
  it("빈 배열은 빈 객체", () => expect(latestByDate([])).toEqual({}));
});
