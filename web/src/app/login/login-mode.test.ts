import { describe, it, expect } from "vitest";

import { initialLoginMode } from "./login-mode";

// 시민기자 자습 안내(/citizen/guide)가 '회원가입하러 가기' 버튼으로 바로 가입 화면을 열기 위해 ?mode=signup을 받는다.
// 60대 참가자가 로그인 화면에서 '계정이 없으신가요?'를 찾아 누르는 단계를 없애는 것이 목적.
describe("initialLoginMode", () => {
  it("?mode=signup이면 가입 화면으로 시작", () => {
    expect(initialLoginMode("signup")).toBe("signup");
  });
  it("없거나 다른 값이면 로그인 화면(기존 동작)", () => {
    expect(initialLoginMode(null)).toBe("login");
    expect(initialLoginMode("")).toBe("login");
    expect(initialLoginMode("login")).toBe("login");
    expect(initialLoginMode("SIGNUP")).toBe("login");
    expect(initialLoginMode("register")).toBe("login");
  });
});
