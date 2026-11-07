import { describe, it, expect } from "vitest";
import { isoWeekRange, episodeRangeLabel, durationLabel, episodeNoLabel } from "./podcast-episode";

// 기대값은 Python 표준 라이브러리(date.fromisocalendar)로 따로 뽑았다 — 제 계산을 제 계산으로 검산하지 않는다.
describe("isoWeekRange — 주차 한 칸이 덮는 월~일", () => {
  it("2026-W45 는 11월 2일(월)~8일(일)", () => {
    expect(isoWeekRange("2026-W45")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });
  it("1주차는 **지난 해**로 넘어간다 — 2026-W01 은 2025-12-29 시작", () => {
    expect(isoWeekRange("2026-W01")).toEqual({ start: "2025-12-29", end: "2026-01-04" });
  });
  it("53주차가 있는 해도 있다 — 2026-W53 은 다음 해로 넘어간다", () => {
    expect(isoWeekRange("2026-W53")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });
  it("2025-W01", () => {
    expect(isoWeekRange("2025-W01")).toEqual({ start: "2024-12-30", end: "2025-01-05" });
  });
  it("모르는 꼴은 null — 지어내지 않는다", () => {
    expect(isoWeekRange("2026-45")).toBe(null);
    expect(isoWeekRange("")).toBe(null);
    expect(isoWeekRange("아무말")).toBe(null);
  });
  it("있을 수 없는 주차는 null — 54주는 없다", () => {
    expect(isoWeekRange("2026-W54")).toBe(null);
    expect(isoWeekRange("2026-W00")).toBe(null);
  });
  it("53주차가 없는 해에 53주차를 물으면 null — 2025년은 52주까지다", () => {
    expect(isoWeekRange("2025-W53")).toBe(null);
  });
});

// 독자에게는 '45주차'가 아니라 '언제 것인가'를 말한다(고령 독자 — 주차 번호는 우리 내부 이름이다).
describe("episodeRangeLabel — 이 회차가 다루는 날들", () => {
  it("한 달 안이면 달을 한 번만 적는다", () => {
    expect(episodeRangeLabel("2026-W45")).toBe("11월 2일~8일");
  });
  it("달이 바뀌면 양쪽에 달을 적는다", () => {
    expect(episodeRangeLabel("2026-W31")).toBe("7월 27일~8월 2일");
  });
  it("해가 바뀌면 해까지 적는다", () => {
    expect(episodeRangeLabel("2026-W01")).toBe("2025년 12월 29일~2026년 1월 4일");
  });
  it("모르는 주차는 빈 문자열 — 화면에서 조용히 빠진다", () => {
    expect(episodeRangeLabel("아무말")).toBe("");
  });
});

describe("durationLabel — 얼마나 긴가", () => {
  it("분과 초", () => {
    expect(durationLabel(194)).toBe("3분 14초");
  });
  it("딱 맞는 분은 초를 적지 않는다", () => {
    expect(durationLabel(180)).toBe("3분");
  });
  it("1분 미만은 초만", () => {
    expect(durationLabel(42)).toBe("42초");
  });
  it("한 시간을 넘으면 시간까지", () => {
    expect(durationLabel(3754)).toBe("1시간 2분 34초");
  });
  it("모르면 빈 문자열 — '0분'이라 적으면 거짓말이다", () => {
    expect(durationLabel(null)).toBe("");
    expect(durationLabel(undefined)).toBe("");
    expect(durationLabel(0)).toBe("");
  });
});

describe("episodeNoLabel — 몇 번째 이야기인가", () => {
  it("제24화", () => {
    expect(episodeNoLabel(24)).toBe("제24화");
  });
  it("회차를 모르면 빈 문자열", () => {
    expect(episodeNoLabel(null)).toBe("");
    expect(episodeNoLabel(0)).toBe("");
    expect(episodeNoLabel(undefined)).toBe("");
  });
});
