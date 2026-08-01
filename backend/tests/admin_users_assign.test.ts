import { describe, it, expect } from "vitest";
import { canAssignRole } from "../src/auth/roles";
import { deriveRequesterRole } from "../src/auth/session_guard";

// 핸들러가 쓰는 결정 조합을 통합 검증(핸들러는 이 두 순수함수를 그대로 사용).
describe("임명 권한 결정", () => {
  it("일반관리자(세션 admin)가 reporter 부여 시도 → 거부", () => {
    const requester = deriveRequesterRole({ id: 1, uid: "u1", email: "", role: "admin", plan: "" }, false);
    expect(canAssignRole(requester, "reporter")).toBe(false);
    expect(canAssignRole(requester, "citizen")).toBe(true);
  });
  it("ADMIN_TOKEN(세션 없음·토큰OK)은 superadmin 실효 → admin 부여 허용", () => {
    const requester = deriveRequesterRole(null, true);
    expect(canAssignRole(requester, "admin")).toBe(true);
  });
  it("최종관리자(세션 superadmin)는 전부 허용", () => {
    const requester = deriveRequesterRole({ id: 1, uid: "u1", email: "", role: "superadmin", plan: "" }, false);
    expect(canAssignRole(requester, "superadmin")).toBe(true);
  });
});
