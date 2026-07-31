import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// 배선 회귀 방지: adminGuard가 세션 브리지 헬퍼를 실제로 임포트·사용하는지.
describe("adminGuard 세션 브리지 배선", () => {
  const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  it("session_guard 헬퍼를 임포트한다", () => {
    expect(src).toMatch(/adminGuardDecision/);
    expect(src).toMatch(/sessionUser/);
    expect(src).toMatch(/from "\.\/auth\/session_guard"/);
  });
  it("ADMIN_TOKEN 폴백 문구를 유지한다(비상용)", () => {
    expect(src).toMatch(/admin_not_configured/);
  });
});
