import { describe, it, expect } from "vitest";
import { accountNumberOf } from "./bank";

describe("계좌번호만 뽑기 — 은행 앱에 붙여넣을 것은 숫자뿐이다", () => {
  it("실제로 쓰는 값(신한, 하이픈 없음)", () => {
    expect(accountNumberOf("신한은행 45305016750 (주)엔씨투")).toBe("45305016750");
  });
  it("하이픈이 있는 표기", () => {
    expect(accountNumberOf("농협 301-0000-0000-00 태안신문")).toBe("301-0000-0000-00");
    expect(accountNumberOf("카카오뱅크 3333-01-1234567 홍길동")).toBe("3333-01-1234567");
  });
  it("예금주에 숫자가 섞여도 긴 쪽이 계좌번호다", () => {
    expect(accountNumberOf("우리은행 1002-345-678901 제2태안영농조합")).toBe("1002-345-678901");
  });
  it("계좌번호가 없으면 null — 통째 복사로 되돌린다", () => {
    expect(accountNumberOf("계좌 준비 중")).toBeNull();
    expect(accountNumberOf("")).toBeNull();
    expect(accountNumberOf(null)).toBeNull();
  });
  it("앞뒤에 붙은 하이픈은 떼어낸다", () => {
    expect(accountNumberOf("신한 -45305016750-")).toBe("45305016750");
  });
});
