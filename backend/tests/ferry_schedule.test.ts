// 가의도 뱃길 시간표 — '다음 배' 안내는 밤·이른아침·계절경계에서 틀리기 쉬워 경계를 고정한다.
//   하계(4~9월) 안흥 출발 08:30·13:30·17:00 / 동계(10~3월) 08:30·13:30·16:30 (태안군청 공식)

import { describe, it, expect } from "vitest";
import { nextDeparture, seasonOf, beforeFirstDeparture } from "../src/env/ferry";

describe("seasonOf", () => {
  it("4~9월은 하계, 10~3월은 동계", () => {
    for (const m of [4, 5, 6, 7, 8, 9]) expect(seasonOf(m)).toBe("하계");
    for (const m of [10, 11, 12, 1, 2, 3]) expect(seasonOf(m)).toBe("동계");
  });
});

describe("nextDeparture", () => {
  it("첫 배 전(새벽)이면 오늘 첫 배", () => {
    expect(nextDeparture("02:11", 8)).toEqual({ when: "오늘", time: "08:30" });
  });

  it("배 사이 시간이면 다음 편", () => {
    expect(nextDeparture("09:00", 8)).toEqual({ when: "오늘", time: "13:30" });
    expect(nextDeparture("14:00", 8)).toEqual({ when: "오늘", time: "17:00" });
  });

  it("막배가 끊긴 밤이면 내일 첫 배 — '오늘 완료'만 보여주던 문제의 핵심", () => {
    expect(nextDeparture("21:34", 8)).toEqual({ when: "내일", time: "08:30" });
    expect(nextDeparture("23:59", 8)).toEqual({ when: "내일", time: "08:30" });
  });

  it("출항 시각 정각은 이미 떠난 것으로 본다(놓친 배를 다음 배라 안내하지 않음)", () => {
    expect(nextDeparture("08:30", 8)).toEqual({ when: "오늘", time: "13:30" });
  });

  it("동계는 막배가 16:30이라 17시엔 이미 끝난다(하계와 갈림)", () => {
    expect(nextDeparture("17:00", 1)).toEqual({ when: "내일", time: "08:30" });
    expect(nextDeparture("17:00", 8)).toEqual({ when: "내일", time: "08:30" });
    expect(nextDeparture("16:00", 1)).toEqual({ when: "오늘", time: "16:30" });
    expect(nextDeparture("16:00", 8)).toEqual({ when: "오늘", time: "17:00" });
  });
});

// 호출 예산 게이트 — 이 API는 운항이 실제로 일어난 뒤에야 행을 만든다(실측 2026-08-17: 07:48 0행 → 10:33 2행).
//   첫 배 전에 조회하면 매일 오전 8시간 반 동안 빈 응답만 받으며 일 100건 한도를 태운다.
describe("beforeFirstDeparture (호출 예산 게이트)", () => {
  it("첫 배(08:30) 전에는 조회하지 않는다", () => {
    for (const t of ["00:00", "02:11", "07:48", "08:29"]) expect(beforeFirstDeparture(t, 8)).toBe(true);
  });

  it("첫 배 시각부터는 조회한다", () => {
    for (const t of ["08:30", "10:33", "17:00", "23:59"]) expect(beforeFirstDeparture(t, 8)).toBe(false);
  });

  it("계절이 달라도 첫 배는 08:30이라 게이트 시각은 같다", () => {
    expect(beforeFirstDeparture("08:29", 1)).toBe(true);
    expect(beforeFirstDeparture("08:30", 1)).toBe(false);
  });
});
