import { describe, it, expect } from "vitest";

import { adminGuard } from "../src/auth/session_guard";

// 배선 회귀 방지: adminGuard(index.ts가 마운트하는 실물)가 실제로 세션/토큰 분기를 수행하는지.
const fakeDb = (row: unknown) =>
  ({ prepare: () => ({ bind: () => ({ first: async () => row }) }) }) as unknown as D1Database;

function makeCtx(opts: {
  method?: string;
  authHeader?: string;
  adminTokenHeader?: string;
  db?: unknown;
  adminToken?: string;
}) {
  const jsonCalls: Array<{ body: unknown; status?: number }> = [];
  const c = {
    req: {
      method: opts.method ?? "GET",
      header: (k: string) => {
        if (k === "Authorization") return opts.authHeader;
        if (k === "X-Admin-Token") return opts.adminTokenHeader;
        return undefined;
      },
    },
    env: { ARCHIVE_DB: opts.db, ADMIN_TOKEN: opts.adminToken } as never,
    json: (body: unknown, status?: number) => {
      jsonCalls.push({ body, status });
      return { body, status };
    },
  };
  return { c, jsonCalls };
}

describe("adminGuard — 실호출 검증", () => {
  it("OPTIONS 메서드는 next()로 통과, json 미호출", async () => {
    const { c, jsonCalls } = makeCtx({ method: "OPTIONS" });
    let nextCalled = false;
    await adminGuard(c, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(jsonCalls.length).toBe(0);
  });

  it("세션 admin + 토큰 없음 → next 통과", async () => {
    const { c, jsonCalls } = makeCtx({
      db: fakeDb({ id: 1, email: "a@b.c", role: "admin", plan: "org" }),
      authHeader: "Bearer tok",
      adminToken: "SECRET",
    });
    let nextCalled = false;
    await adminGuard(c, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(jsonCalls.length).toBe(0);
  });

  it("세션 없음 + X-Admin-Token 일치 → next 통과", async () => {
    const { c, jsonCalls } = makeCtx({
      db: fakeDb(null),
      adminTokenHeader: "SECRET",
      adminToken: "SECRET",
    });
    let nextCalled = false;
    await adminGuard(c, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(jsonCalls.length).toBe(0);
  });

  it("X-Admin-Token 불일치 → 401 unauthorized", async () => {
    const { c, jsonCalls } = makeCtx({
      db: fakeDb(null),
      adminTokenHeader: "WRONG",
      adminToken: "SECRET",
    });
    let nextCalled = false;
    await adminGuard(c, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(jsonCalls).toEqual([{ body: { error: "unauthorized" }, status: 401 }]);
  });

  it("ADMIN_TOKEN 미설정 + 세션 없음 → 503 admin_not_configured", async () => {
    const { c, jsonCalls } = makeCtx({ db: fakeDb(null), adminToken: undefined });
    let nextCalled = false;
    await adminGuard(c, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(jsonCalls.length).toBe(1);
    expect(jsonCalls[0].status).toBe(503);
    expect(jsonCalls[0].body).toMatchObject({ error: "admin_not_configured" });
  });
});
