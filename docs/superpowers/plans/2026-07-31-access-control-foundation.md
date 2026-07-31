# 접근제어 기반(백엔드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 회원의 세션 토큰 기반 역할 판정·가드와 관리자 인증 통합(이메일+비번 → admin API)을 만들어, 회원 등급(user<citizen<reporter<admin<superadmin) 접근제어의 백엔드 토대를 완성한다.

**Architecture:** 순수 역할 로직(`roles.ts`: 순위·임명권한)과 세션 조회/가드(`session_guard.ts`: `sessions JOIN users`)를 분리한다. 기존 `adminGuard`(공유 토큰)를 확장해 세션 role이 admin 이상이면 통과시키고, `/api/admin/users`의 등급 부여에 임명 권한을 강제한다. JWT 미들웨어(`middleware.ts`)는 별개/레거시 계통이라 건드리지 않는다.

**Tech Stack:** Cloudflare Workers + Hono, D1(SQLite), vitest, TypeScript.

## 전체 로드맵(이 계획은 1/4)

1. **접근제어 기반(백엔드)** ← 이 문서
2. 프런트 계층 반영(메뉴 지도·라우트 가드·admin 콘솔 세션 전환)
3. 회원관리 + 시민기자 신청/승인(036 마이그레이션·API·UI)
4. `/write` 통합 투고 에디터

## Global Constraints

- Cloudflare 전용(Workers/D1). Vercel·Firebase·NAS 금지.
- **평문 비밀번호를 화면·명령줄·커밋에 노출 금지.** 서버는 PBKDF2 해시만 저장. 이 계획은 비밀번호를 다루지 않는다(역할·세션만).
- 웹 회원 인증 = **불투명 세션 토큰**(`sessions` 테이블: token PK·user_id·created_at·expires_at). role은 `users.role`(TEXT, CHECK 제약 없음, 기본 `'user'`). `Authorization: Bearer <세션토큰>`으로 전송.
- JWT 미들웨어(`backend/src/auth/middleware.ts`의 `requireAuth`/`requireRole`)는 role 어휘가 다른(`b2c_basic`·`editor`…) 별개 계통 — **이 계획에서 사용·수정하지 않는다.**
- `ADMIN_TOKEN`(X-Admin-Token)은 스크립트·크론·비상용으로 유지. 세션 admin 경로를 우선 통과시키되 토큰 폴백을 남긴다.
- 역할 순위: `user(0) < citizen(1) < reporter(2) < admin(3) < superadmin(4)`.
- 임명 규칙: `superadmin`은 모든 등급 부여 가능. `admin`은 `user`·`citizen`만(시민기자 승인/해제). 그 외 불가.
- 배포는 절대경로 cwd(`cd /Applications/taean/backend`), 사용자 승인 후. 테스트: `cd /Applications/taean/backend && npx vitest run <파일>`.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- Create `backend/src/auth/roles.ts` — 순수 역할 로직(순위·hasRole·canAssignRole). 의존성 없음.
- Create `backend/tests/auth_roles.test.ts` — roles.ts 단위 테스트.
- Create `backend/src/auth/session_guard.ts` — 세션 조회(`sessionUser`)·Bearer 추출·세션 역할 가드(`requireSessionRole`)·순수 결정 헬퍼(`adminGuardDecision`·`deriveRequesterRole`).
- Create `backend/tests/session_guard.test.ts` — session_guard 순수 헬퍼 + `sessionUser`(가짜 D1) 테스트.
- Modify `backend/src/index.ts:54-62` — `adminGuard`에 세션 admin 브리지 추가.
- Modify `backend/src/auth/admin_router.ts:16-29` — zod role enum 확장 + `/set`에 임명 권한 강제.

---

### Task 1: 순수 역할 로직 (roles.ts)

**Files:**
- Create: `backend/src/auth/roles.ts`
- Test: `backend/tests/auth_roles.test.ts`

**Interfaces:**
- Produces:
  - `type Role = "user" | "citizen" | "reporter" | "admin" | "superadmin"`
  - `ROLE_VALUES: readonly Role[]`
  - `ROLE_RANK: Record<Role, number>`
  - `hasRole(userRole: string, minRole: Role): boolean` — userRole이 minRole 이상이면 true. 미지의 role은 false.
  - `canAssignRole(requesterRole: string, targetRole: Role): boolean` — 요청자가 대상 등급을 부여할 수 있는가.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/auth_roles.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Applications/taean/backend && npx vitest run tests/auth_roles.test.ts`
Expected: FAIL — `Cannot find module '../src/auth/roles'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/auth/roles.ts`:

```ts
// 회원 등급(role) 순수 로직 — 순위·게이트·임명권한. 의존성 없음(TDD 대상).
//   순위: user < citizen < reporter < admin < superadmin.

export const ROLE_VALUES = ["user", "citizen", "reporter", "admin", "superadmin"] as const;
export type Role = (typeof ROLE_VALUES)[number];

export const ROLE_RANK: Record<Role, number> = {
  user: 0,
  citizen: 1,
  reporter: 2,
  admin: 3,
  superadmin: 4,
};

// userRole이 minRole 이상이면 true. 미지의 role(레거시·빈값)은 false.
export function hasRole(userRole: string, minRole: Role): boolean {
  const r = ROLE_RANK[userRole as Role];
  return r !== undefined && r >= ROLE_RANK[minRole];
}

// 요청자가 대상 등급을 부여할 수 있는가.
//   superadmin: 전부. admin: user·citizen만(시민기자 승인/해제). 그 외: 불가.
export function canAssignRole(requesterRole: string, targetRole: Role): boolean {
  if (requesterRole === "superadmin") return true;
  if (requesterRole === "admin") return targetRole === "user" || targetRole === "citizen";
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Applications/taean/backend && npx vitest run tests/auth_roles.test.ts`
Expected: PASS (3 + 3 assertions groups green).

- [ ] **Step 5: Commit**

```bash
cd /Applications/taean/backend
git add src/auth/roles.ts tests/auth_roles.test.ts
git commit -m "feat(auth): 회원 등급 순수 로직(순위·hasRole·임명권한)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 세션 역할 가드 (session_guard.ts)

**Files:**
- Create: `backend/src/auth/session_guard.ts`
- Test: `backend/tests/session_guard.test.ts`

**Interfaces:**
- Consumes: `hasRole`, `Role` from `./roles` (Task 1).
- Produces:
  - `interface SessionUser { id: number; email: string; role: string; plan: string }`
  - `bearerToken(c): string | null` — `Authorization: Bearer <t>`에서 토큰 추출.
  - `sessionUser(db, token): Promise<SessionUser | null>` — `sessions JOIN users`로 만료 전 세션의 사용자.
  - `adminGuardDecision(su: SessionUser | null, xAdminToken: string | undefined, expected: string | undefined): "pass" | "unauthorized" | "not_configured"` — adminGuard 순수 판정.
  - `deriveRequesterRole(su: SessionUser | null, tokenOk: boolean): string` — 요청자 실효 등급(세션 role, 없고 토큰OK면 superadmin, 아니면 user).
  - `requireSessionRole(minRole: Role): MiddlewareHandler` — 세션 minRole 이상 가드(미들웨어).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/session_guard.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Applications/taean/backend && npx vitest run tests/session_guard.test.ts`
Expected: FAIL — `Cannot find module '../src/auth/session_guard'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/auth/session_guard.ts`:

```ts
// 세션 기반 역할 인증 — 웹 회원(불투명 세션 토큰)용. JWT 미들웨어와 별개.
//   sessions JOIN users 로 role 조회. adminGuard 브리지·회원 등급 가드에서 재사용.

import type { MiddlewareHandler } from "hono";

import { hasRole, type Role } from "./roles";

export interface SessionUser {
  id: number;
  email: string;
  role: string;
  plan: string;
}

// Authorization: Bearer <토큰> 추출(대소문자 무관). 없으면 null.
export function bearerToken(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const h = c.req.header("Authorization");
  return h && h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

// 만료 전 세션의 사용자(role·plan 포함). 토큰/DB 없으면 null.
export async function sessionUser(db: D1Database | undefined, token: string | null): Promise<SessionUser | null> {
  if (!db || !token) return null;
  const row = await db
    .prepare(
      "SELECT u.id, u.email, u.role, u.plan FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at > ?",
    )
    .bind(token, new Date().toISOString())
    .first<SessionUser>();
  return row ?? null;
}

// adminGuard 순수 판정: 세션 admin+ 또는 X-Admin-Token 일치면 통과.
export function adminGuardDecision(
  su: SessionUser | null,
  xAdminToken: string | undefined,
  expected: string | undefined,
): "pass" | "unauthorized" | "not_configured" {
  if (su && hasRole(su.role, "admin")) return "pass";
  if (!expected) return "not_configured";
  return xAdminToken === expected ? "pass" : "unauthorized";
}

// 요청자 실효 등급: 세션 role 우선, 없고 토큰OK면 superadmin(루트 비상권), 아니면 user.
export function deriveRequesterRole(su: SessionUser | null, tokenOk: boolean): string {
  if (su) return su.role;
  return tokenOk ? "superadmin" : "user";
}

// 세션 minRole 이상 가드(웹 회원용 미들웨어). 통과 시 c.set("sessionUser", …).
export function requireSessionRole(
  minRole: Role,
): MiddlewareHandler<{ Bindings: { ARCHIVE_DB?: D1Database }; Variables: { sessionUser: SessionUser } }> {
  return async (c, next) => {
    const u = await sessionUser(c.env.ARCHIVE_DB, bearerToken(c));
    if (!u) return c.json({ error: "unauthorized", reason: "no_session" }, 401);
    if (!hasRole(u.role, minRole)) return c.json({ error: "forbidden", required: minRole }, 403);
    c.set("sessionUser", u);
    await next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Applications/taean/backend && npx vitest run tests/session_guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Applications/taean/backend
git add src/auth/session_guard.ts tests/session_guard.test.ts
git commit -m "feat(auth): 세션 기반 역할 가드 + adminGuard 순수 판정 헬퍼

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: adminGuard 세션 브리지 (index.ts)

**Files:**
- Modify: `backend/src/index.ts` (adminGuard, 현재 54-64행)

**Interfaces:**
- Consumes: `sessionUser`, `bearerToken`, `adminGuardDecision` from `./auth/session_guard` (Task 2).
- Produces: 변경된 `adminGuard` — 세션 admin+ 또는 X-Admin-Token이면 통과. 동작 계약은 `adminGuardDecision`과 동일.

- [ ] **Step 1: Write the failing test**

`adminGuard`의 판정은 이미 Task 2의 `adminGuardDecision` 테스트로 검증됨(순수 분리). 이 태스크는 **배선(wiring)**이므로 추가 단위 테스트 대신, index가 세 헬퍼를 실제로 사용하는지 확인하는 얇은 가드 테스트를 둔다.

Create `backend/tests/admin_guard_wiring.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Applications/taean/backend && npx vitest run tests/admin_guard_wiring.test.ts`
Expected: FAIL — `adminGuardDecision`/import 미존재.

- [ ] **Step 3: Modify index.ts**

`backend/src/index.ts` 상단 import 블록에 추가:

```ts
import { sessionUser, bearerToken, adminGuardDecision } from "./auth/session_guard";
```

기존 `adminGuard`(54-62행)를 아래로 교체:

```ts
// 관리자 보호 — 세션 role이 admin 이상이거나 X-Admin-Token 일치면 통과.
//   ADMIN_TOKEN은 스크립트·크론·비상용 폴백으로 유지(미설정이면 503 잠금).
const adminGuard = async (
  c: {
    req: { method: string; header: (k: string) => string | undefined };
    env: Env;
    json: (b: unknown, s?: number) => Response;
  },
  next: () => Promise<void>,
) => {
  if (c.req.method === "OPTIONS") return next();
  const su = await sessionUser(c.env.ARCHIVE_DB, bearerToken(c));
  const decision = adminGuardDecision(su, c.req.header("X-Admin-Token"), c.env.ADMIN_TOKEN);
  if (decision === "pass") return next();
  if (decision === "not_configured")
    return c.json({ error: "admin_not_configured", hint: "Set ADMIN_TOKEN secret" }, 503);
  return c.json({ error: "unauthorized" }, 401);
};
```

> 참고: `c.env.ADMIN_TOKEN`이 `Env` 타입에 없으면 `(c.env as Env & { ADMIN_TOKEN?: string })`로 좁혀 접근(audio/router.ts와 동일 패턴).

- [ ] **Step 4: Run tests + 타입체크**

Run: `cd /Applications/taean/backend && npx vitest run tests/admin_guard_wiring.test.ts tests/session_guard.test.ts tests/auth_roles.test.ts`
Expected: PASS.
Run: `cd /Applications/taean/backend && npx tsc --noEmit 2>&1 | grep -E "index.ts|session_guard.ts|roles.ts" || echo "내 파일 타입 에러 없음"`
Expected: "내 파일 타입 에러 없음"(기존 무관 에러는 무시).

- [ ] **Step 5: Commit**

```bash
cd /Applications/taean/backend
git add src/index.ts tests/admin_guard_wiring.test.ts
git commit -m "feat(auth): adminGuard에 세션 admin 브리지(이메일+비번 통합), 토큰 폴백 유지

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 임명 권한 강제 (/api/admin/users)

**Files:**
- Modify: `backend/src/auth/admin_router.ts:16-29`
- Test: `backend/tests/admin_users_assign.test.ts`

**Interfaces:**
- Consumes: `canAssignRole` from `../auth/roles`(Task 1), `sessionUser`·`bearerToken`·`deriveRequesterRole` from `../auth/session_guard`(Task 2).
- Produces: `POST /api/admin/users/set` — role 부여 시 요청자 실효 등급으로 `canAssignRole` 검증(월권 403). zod role enum에 `citizen`·`superadmin` 추가.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/admin_users_assign.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canAssignRole } from "../src/auth/roles";
import { deriveRequesterRole } from "../src/auth/session_guard";

// 핸들러가 쓰는 결정 조합을 통합 검증(핸들러는 이 두 순수함수를 그대로 사용).
describe("임명 권한 결정", () => {
  it("일반관리자(세션 admin)가 reporter 부여 시도 → 거부", () => {
    const requester = deriveRequesterRole({ id: 1, email: "", role: "admin", plan: "" }, false);
    expect(canAssignRole(requester, "reporter")).toBe(false);
    expect(canAssignRole(requester, "citizen")).toBe(true);
  });
  it("ADMIN_TOKEN(세션 없음·토큰OK)은 superadmin 실효 → admin 부여 허용", () => {
    const requester = deriveRequesterRole(null, true);
    expect(canAssignRole(requester, "admin")).toBe(true);
  });
  it("최종관리자(세션 superadmin)는 전부 허용", () => {
    const requester = deriveRequesterRole({ id: 1, email: "", role: "superadmin", plan: "" }, false);
    expect(canAssignRole(requester, "superadmin")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Applications/taean/backend && npx vitest run tests/admin_users_assign.test.ts`
Expected: FAIL — `deriveRequesterRole` 임포트 실패(Task 2 미완이면) 또는 로직 미반영. Task 1·2 완료 상태면 이 테스트는 통과할 수도 있으므로, **핸들러 반영은 Step 3에서 확인**한다.

- [ ] **Step 3: Modify admin_router.ts**

상단 import에 추가:

```ts
import { canAssignRole } from "./roles";
import { sessionUser, bearerToken, deriveRequesterRole } from "./session_guard";
```

`setSchema`의 role enum 확장(18행):

```ts
const setSchema = z.object({
  id: z.number().int(),
  role: z.enum(["user", "citizen", "reporter", "admin", "superadmin"]).optional(),
  plan: z.enum(["free", "reader", "business", "org"]).optional(),
});
```

`/set` 핸들러(21-29행)를 아래로 교체:

```ts
adminUsersRouter.post("/set", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const p = setSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success || (!p.data.role && !p.data.plan)) return c.json({ error: "invalid_input" }, 400);

  // 요청자 실효 등급 — 세션 role, 없고 X-Admin-Token 일치면 superadmin(루트 비상권).
  const env = c.env as Env & { ADMIN_TOKEN?: string };
  const su = await sessionUser(db, bearerToken(c));
  const tokenOk = !!env.ADMIN_TOKEN && c.req.header("X-Admin-Token") === env.ADMIN_TOKEN;
  const requesterRole = deriveRequesterRole(su, tokenOk);

  if (p.data.role && !canAssignRole(requesterRole, p.data.role)) {
    return c.json({ error: "insufficient_privilege", hint: "reporter·admin 임명은 superadmin만" }, 403);
  }
  if (p.data.role) await db.prepare("UPDATE users SET role=? WHERE id=?").bind(p.data.role, p.data.id).run();
  if (p.data.plan) await db.prepare("UPDATE users SET plan=? WHERE id=?").bind(p.data.plan, p.data.id).run();
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run tests + 타입체크**

Run: `cd /Applications/taean/backend && npx vitest run tests/admin_users_assign.test.ts tests/auth_roles.test.ts tests/session_guard.test.ts`
Expected: PASS.
Run: `cd /Applications/taean/backend && npx tsc --noEmit 2>&1 | grep -E "admin_router.ts" || echo "admin_router 타입 에러 없음"`
Expected: "admin_router 타입 에러 없음".

- [ ] **Step 5: Commit**

```bash
cd /Applications/taean/backend
git add src/auth/admin_router.ts tests/admin_users_assign.test.ts
git commit -m "feat(auth): 등급 부여에 임명 권한 강제(admin=citizen까지·reporter/admin은 superadmin)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 통합 확인(계획 완료 후)

- [ ] 전체 백엔드 테스트: `cd /Applications/taean/backend && npx vitest run` — 기존 통과분 회귀 없음 + 신규 3파일 통과.
- [ ] 배포(사용자 승인 후): `cd /Applications/taean/backend && npx wrangler deploy`.
- [ ] **부트스트랩(사용자 승인 후, 1회)**: 최종관리자 승격 —
  `cd /Applications/taean/backend && npx wrangler d1 execute taean-archive --remote --command "UPDATE users SET role='superadmin', plan='org' WHERE email='chs9182@gmail.com'"`
  (해당 이메일로 먼저 `/login` 회원가입 되어 있어야 함. 비밀번호 무관.)
- [ ] 라이브 스모크: 최종관리자 세션 토큰으로 `GET /api/admin/users`가 X-Admin-Token 없이 200. 일반회원 세션으론 401.

## 이 계획의 산출물(다음 계획의 전제)

- `roles.ts`: `Role`·`ROLE_RANK`·`hasRole`·`canAssignRole`.
- `session_guard.ts`: `SessionUser`·`sessionUser`·`bearerToken`·`requireSessionRole`·`adminGuardDecision`·`deriveRequesterRole`.
- adminGuard가 세션 admin+ 허용(계획 2의 프런트 admin 콘솔 세션 전환이 이걸 사용).
- `/api/admin/users/set`가 citizen·superadmin 부여 지원 + 임명 권한 강제(계획 3의 회원관리 UI가 이걸 사용).
