// 여객선 운항상태 분류 — 화면 강조와 기자 '결항' 취재 알림이 이 함수 하나에 달려 있다.
//   이전엔 이진 판정이라 '모르는 문구 = 정상'으로 단정했다. 결항인데 표기를 우리가 모르면
//   독자에게 '정상'이라 거짓말하는 셈이라, '모름'을 별도 상태로 분리했다.

import { describe, it, expect } from "vitest";
import { classifyStatus } from "../src/env/ferry";

describe("classifyStatus", () => {
  it("실측된 정상 상태값(2026-08-14 관측)", () => {
    for (const s of ["완료", "출항중", "운항중"]) expect(classifyStatus(s)).toBe("normal");
  });

  it("결항·통제 계열은 확실히 잡는다 — '운항통제'처럼 정상 어휘가 섞여도 결항이 우선", () => {
    for (const s of ["결항", "운항통제", "통제", "운항중단", "운항취소"]) expect(classifyStatus(s)).toBe("disrupted");
  });

  it("예상 가능한 정상 어휘도 정상으로", () => {
    for (const s of ["입항", "접안", "대기", "운항예정", "정상운항"]) expect(classifyStatus(s)).toBe("normal");
  });

  it("모르는 문구는 '정상'이라 단정하지 않고 unknown", () => {
    for (const s of ["정보없음", "", "기타", "확인불가"]) expect(classifyStatus(s)).toBe("unknown");
  });
});
