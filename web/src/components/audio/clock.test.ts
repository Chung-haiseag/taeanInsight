import { describe, expect, it } from "vitest";

import { clock, spoken } from "./clock";

describe("진행바 옆 시간", () => {
  it("분:초로 적는다", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(9)).toBe("0:09");
    expect(clock(143)).toBe("2:23");
    expect(clock(3600)).toBe("60:00");
  });
  it("모르는 값은 0:00 — NaN 을 화면에 내보내지 않는다", () => {
    expect(clock(NaN)).toBe("0:00");
    expect(clock(-5)).toBe("0:00");
    expect(clock(Infinity)).toBe("0:00");
  });
});

describe("사람이 읽는 길이", () => {
  it("분과 초를 말로 적는다", () => {
    expect(spoken(143)).toBe("2분 23초");
    expect(spoken(180)).toBe("3분");
    expect(spoken(40)).toBe("40초");
  });
  it("초가 60으로 올라가면 분으로 올린다 — '0분 60초'는 말이 아니다", () => {
    expect(spoken(59.6)).toBe("1분");
    expect(spoken(119.7)).toBe("2분");
  });
  it("모르면 적지 않는다", () => {
    expect(spoken(NaN)).toBe("");
  });
});
