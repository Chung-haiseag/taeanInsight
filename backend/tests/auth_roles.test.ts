import { describe, it, expect } from "vitest";
import { hasRole, canAssignRole, ROLE_VALUES, ROLE_RANK } from "../src/auth/roles";

describe("hasRole — 역할 순위 게이트", () => {
  it("동급/상위면 통과, 하위면 실패", () => {
    expect(hasRole("admin", "admin")).toBe(true);
    expect(hasRole("superadmin", "admin")).toBe(true);
    expect(hasRole("citizen", "reporter")).toBe(false);
    expect(hasRole("user", "citizen")).toBe(false);
  });
  it("미지의 role은 false", () => {
    expect(hasRole("editor", "user")).toBe(false);   // 레거시 어휘 불인정
    expect(hasRole("", "user")).toBe(false);
  });
  it("순위 상수는 5단계", () => {
    expect(ROLE_VALUES.length).toBe(5);
    expect(ROLE_RANK.user).toBeLessThan(ROLE_RANK.superadmin);
  });
});

describe("canAssignRole — 임명 권한", () => {
  it("superadmin은 모든 등급 부여", () => {
    for (const t of ROLE_VALUES) expect(canAssignRole("superadmin", t)).toBe(true);
  });
  it("admin은 user·citizen만", () => {
    expect(canAssignRole("admin", "citizen")).toBe(true);
    expect(canAssignRole("admin", "user")).toBe(true);
    expect(canAssignRole("admin", "reporter")).toBe(false);
    expect(canAssignRole("admin", "admin")).toBe(false);
  });
  it("그 외는 불가", () => {
    expect(canAssignRole("reporter", "citizen")).toBe(false);
    expect(canAssignRole("user", "user")).toBe(false);
  });
});
