import { describe, it, expect } from "vitest";
import { bearerToken, adminGuardDecision, deriveRequesterRole, sessionUser } from "../src/auth/session_guard";

const ctx = (h?: string) => ({ req: { header: (k: string) => (k === "Authorization" ? h : undefined) } });

describe("bearerToken", () => {
  it("Bearer 토큰 추출, 대소문자 무관", () => {
    expect(bearerToken(ctx("Bearer abc123"))).toBe("abc123");
    expect(bearerToken(ctx("bearer xy"))).toBe("xy");
    expect(bearerToken(ctx(undefined))).toBeNull();
    expect(bearerToken(ctx("Basic zzz"))).toBeNull();
  });
});

describe("adminGuardDecision — adminGuard 순수 판정", () => {
  const su = (role: string) => ({ id: 1, email: "a@b.c", role, plan: "org" });
  it("세션 admin 이상이면 통과(토큰 무관)", () => {
    expect(adminGuardDecision(su("admin"), undefined, "SECRET")).toBe("pass");
    expect(adminGuardDecision(su("superadmin"), undefined, undefined)).toBe("pass");
  });
  it("세션 미달 + 토큰 일치면 통과", () => {
    expect(adminGuardDecision(su("user"), "SECRET", "SECRET")).toBe("pass");
    expect(adminGuardDecision(null, "SECRET", "SECRET")).toBe("pass");
  });
  it("토큰 미설정이면 not_configured", () => {
    expect(adminGuardDecision(null, undefined, undefined)).toBe("not_configured");
  });
  it("세션 미달 + 토큰 불일치면 unauthorized", () => {
    expect(adminGuardDecision(su("citizen"), "WRONG", "SECRET")).toBe("unauthorized");
    expect(adminGuardDecision(null, undefined, "SECRET")).toBe("unauthorized");
  });
});

describe("deriveRequesterRole", () => {
  it("세션 있으면 세션 role", () => {
    expect(deriveRequesterRole({ id: 1, email: "", role: "admin", plan: "" }, false)).toBe("admin");
  });
  it("세션 없고 토큰OK면 superadmin", () => {
    expect(deriveRequesterRole(null, true)).toBe("superadmin");
  });
  it("세션 없고 토큰 미검증이면 user", () => {
    expect(deriveRequesterRole(null, false)).toBe("user");
  });
});

describe("sessionUser — 가짜 D1", () => {
  const fakeDb = (row: unknown) => ({
    prepare: () => ({ bind: () => ({ first: async () => row }) }),
  }) as unknown as D1Database;
  it("행 있으면 SessionUser, 없으면 null", async () => {
    const u = await sessionUser(fakeDb({ id: 7, email: "x@y.z", role: "reporter", plan: "free" }), "tok");
    expect(u?.role).toBe("reporter");
    expect(await sessionUser(fakeDb(null), "tok")).toBeNull();
    expect(await sessionUser(fakeDb({}), null)).toBeNull(); // 토큰 없으면 조회 안 함
  });
});
