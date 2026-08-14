// 가의도 뱃길 시간표 — '다음 배' 안내는 밤·이른아침·계절경계에서 틀리기 쉬워 경계를 고정한다.
//   하계(4~9월) 안흥 출발 08:30·13:30·17:00 / 동계(10~3월) 08:30·13:30·16:30 (태안군청 공식)

import { describe, it, expect } from "vitest";
import { nextDeparture, seasonOf } from "../src/env/ferry";

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
