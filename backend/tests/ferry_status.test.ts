// 여객선 운항상태 판정 — 화면 강조와 기자 '결항' 취재 알림이 이 함수 하나에 달려 있다.
//   오탐(정상인데 결항 알림)과 미탐(결항인데 조용함) 둘 다 치명적이라 양쪽을 고정한다.

import { describe, it, expect } from "vitest";
import { isNormalStatus } from "../src/env/ferry";

describe("isNormalStatus", () => {
  it("실측된 정상 상태값을 정상으로 본다(2026-08-14 관측)", () => {
    for (const s of ["완료", "출항중", "운항중"]) expect(isNormalStatus(s)).toBe(true);
  });

  it("결항·통제 계열을 비정상으로 잡는다", () => {
    for (const s of ["결항", "운항통제", "통제", "운항중단", "운항취소"]) expect(isNormalStatus(s)).toBe(false);
  });

  it("아직 못 본 정상 상태값이 생겨도 가짜 결항 알림을 내지 않는다(블랙리스트 방식)", () => {
    for (const s of ["입항", "대기", "운항예정", "접안", "정보없음"]) expect(isNormalStatus(s)).toBe(true);
  });
});
