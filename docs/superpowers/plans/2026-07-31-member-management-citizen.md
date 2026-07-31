# 회원관리 + 시민기자 신청/승인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일반회원이 시민기자를 신청하고 관리자가 승인/반려하는 흐름과, 관리자 회원관리에 등급(citizen 포함) 부여·강등 보호를 추가한다.

**Architecture:** 신청 대기열은 새 D1 테이블 `citizen_applications`. 백엔드는 순수 결정로직(승인→citizen 승격 조건)과 얇은 D1 리포지토리 + 엔드포인트(회원 신청/조회, 관리자 목록/결정)로 구성. 프런트는 `/me`에 신청 진입점, admin 콘솔에 신청 대기열 + 등급 셀렉트 확장(권한별). Plan 1의 강등 보호 이월(canModifyUser)을 여기서 반영.

**Tech Stack:** Cloudflare Workers + Hono, D1, vitest, Next.js.

## 전체 로드맵(이 계획은 3/4)

1. 접근제어 기반(백엔드) — 완료·배포.
2. 프런트 계층 반영 — 완료·배포.
3. **회원관리 + 시민기자 신청/승인** ← 이 문서
4. `/write` 통합 투고 에디터

## Global Constraints

- Cloudflare 전용(Workers/D1). 새 마이그레이션은 `db/migrations/036_*.sql`(현재 최신 035). 원격 적용은 사용자 승인 후 `cd backend && npx wrangler d1 execute taean-archive --remote --file db/migrations/036_*.sql`.
- 역할 순위(`backend/src/auth/roles.ts`): user(0)<citizen(1)<reporter(2)<admin(3)<superadmin(4).
- 임명 규칙(기존 `canAssignRole`): superadmin=전부, admin=user·citizen만.
- **강등 보호(신규)**: 요청자는 자신보다 상위 등급의 대상을 변경할 수 없다(`canModifyUser`). admin이 superadmin을 강등 못 함.
- **시민기자 승인 시**: 대상이 `user`일 때만 `citizen`으로 승격(reporter·admin 등 상위는 건드리지 않음).
- 관리자 엔드포인트는 기존 `adminGuard`(세션 admin+ 또는 X-Admin-Token) 상속. 회원 신청 엔드포인트는 세션(`sessionUser`) 필요.
- 프런트 순수 lib는 vitest TDD, 화면 배선은 `npm run build`+스모크.
- 배포는 절대경로 cwd. 커밋 메시지 끝 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- Create `db/migrations/036_citizen_applications.sql` — 신청 대기열 테이블.
- Create `backend/src/citizen/applications.ts` — 순수 결정로직 + D1 리포지토리.
- Create `backend/src/citizen/applications_router.ts` — `/api/admin/citizen-applications`(목록·결정).
- Create `backend/tests/citizen_applications.test.ts` — 순수 로직 + 리포지토리(가짜 D1).
- Modify `backend/src/auth/roles.ts` — `canModifyUser` 추가.
- Modify `backend/src/auth/router.ts` — `POST /api/auth/citizen-apply`·`GET /api/auth/citizen-apply`.
- Modify `backend/src/auth/admin_router.ts` — `/set`에 `canModifyUser` 강등 보호.
- Modify `backend/src/index.ts` — applications_router 마운트.
- Create `web/src/lib/api/citizen-apply.ts` — 신청/내 상태 클라이언트.
- Create `web/src/components/me/citizen-apply.tsx` — 회원용 신청 진입점.
- Modify `web/src/app/me/page.tsx` — 신청 컴포넌트 삽입.
- Modify `web/src/app/admin/page.tsx` — 신청 대기열 섹션 + role 셀렉트 확장(citizen).

---

### Task 1: 백엔드 — 신청 대기열(마이그레이션·리포지토리·회원 엔드포인트)

**Files:**
- Create: `db/migrations/036_citizen_applications.sql`, `backend/src/citizen/applications.ts`
- Modify: `backend/src/auth/router.ts`
- Test: `backend/tests/citizen_applications.test.ts`

**Interfaces:**
- Produces:
  - `type AppStatus = "pending" | "approved" | "rejected"`
  - `interface CitizenApplication { id: number; user_id: number; status: AppStatus; reason: string | null; applied_at: string; decided_at: string | null; decided_by: number | null }`
  - `decisionToStatus(decision: "approve" | "reject"): AppStatus`
  - `shouldPromoteToCitizen(decision: "approve" | "reject", currentRole: string): boolean` — approve이고 현재 user일 때만 true.
  - `applyForCitizen(db, userId: number, reason: string | null, nowIso: string): Promise<void>` — pending upsert(재신청 시 갱신).
  - `myApplication(db, userId: number): Promise<CitizenApplication | null>`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/citizen_applications.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decisionToStatus, shouldPromoteToCitizen, myApplication } from "../src/citizen/applications";

describe("시민기자 신청 순수 결정", () => {
  it("decisionToStatus", () => {
    expect(decisionToStatus("approve")).toBe("approved");
    expect(decisionToStatus("reject")).toBe("rejected");
  });
  it("승인+현재 user일 때만 citizen 승격", () => {
    expect(shouldPromoteToCitizen("approve", "user")).toBe(true);
    expect(shouldPromoteToCitizen("approve", "reporter")).toBe(false); // 상위는 안 건드림
    expect(shouldPromoteToCitizen("approve", "admin")).toBe(false);
    expect(shouldPromoteToCitizen("reject", "user")).toBe(false);
  });
});

describe("myApplication — 가짜 D1", () => {
  const fakeDb = (row: unknown) => ({ prepare: () => ({ bind: () => ({ first: async () => row }) }) }) as unknown as D1Database;
  it("행 있으면 신청, 없으면 null", async () => {
    const app = await myApplication(fakeDb({ id: 1, user_id: 4, status: "pending", reason: null, applied_at: "x", decided_at: null, decided_by: null }), 4);
    expect(app?.status).toBe("pending");
    expect(await myApplication(fakeDb(null), 4)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Applications/taean/backend && npx vitest run tests/citizen_applications.test.ts`
Expected: FAIL — `Cannot find module '../src/citizen/applications'`.

- [ ] **Step 3: Migration + repository**

Create `db/migrations/036_citizen_applications.sql`:

```sql
-- 시민기자 신청 대기열 — 회원 신청 → 관리자 승인/반려. 승인 시 users.role='citizen'.
CREATE TABLE IF NOT EXISTS citizen_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  reason TEXT,                              -- 신청 사유 / 반려 사유
  applied_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by INTEGER,
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_citizen_app_status ON citizen_applications(status);
```

Create `backend/src/citizen/applications.ts`:

```ts
// 시민기자 신청 대기열 — 순수 결정로직 + D1 리포지토리.
export type AppStatus = "pending" | "approved" | "rejected";

export interface CitizenApplication {
  id: number;
  user_id: number;
  status: AppStatus;
  reason: string | null;
  applied_at: string;
  decided_at: string | null;
  decided_by: number | null;
}

export function decisionToStatus(decision: "approve" | "reject"): AppStatus {
  return decision === "approve" ? "approved" : "rejected";
}

// 승인이고 현재 등급이 user일 때만 citizen 승격(상위 등급은 보존).
export function shouldPromoteToCitizen(decision: "approve" | "reject", currentRole: string): boolean {
  return decision === "approve" && currentRole === "user";
}

// 신청(재신청 시 pending으로 갱신). UNIQUE(user_id) 충돌 시 갱신.
export async function applyForCitizen(db: D1Database, userId: number, reason: string | null, nowIso: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO citizen_applications (user_id, status, reason, applied_at, decided_at, decided_by)
       VALUES (?1,'pending',?2,?3,NULL,NULL)
       ON CONFLICT(user_id) DO UPDATE SET status='pending', reason=excluded.reason, applied_at=excluded.applied_at, decided_at=NULL, decided_by=NULL`,
    )
    .bind(userId, reason, nowIso)
    .run();
}

export async function myApplication(db: D1Database, userId: number): Promise<CitizenApplication | null> {
  const row = await db
    .prepare("SELECT id, user_id, status, reason, applied_at, decided_at, decided_by FROM citizen_applications WHERE user_id=?")
    .bind(userId)
    .first<CitizenApplication>();
  return row ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Applications/taean/backend && npx vitest run tests/citizen_applications.test.ts`
Expected: PASS.

- [ ] **Step 5: 회원 엔드포인트(auth/router.ts)**

`backend/src/auth/router.ts` 상단 import에 추가:
```ts
import { sessionUser, bearerToken } from "./session_guard";
import { applyForCitizen, myApplication } from "../citizen/applications";
```

`authRouter`에 두 엔드포인트 추가(예: logout 근처):
```ts
// 시민기자 신청(회원 세션 필요). {reason?}
authRouter.post("/citizen-apply", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const u = await sessionUser(db, bearerToken(c));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  await applyForCitizen(db, u.id, (body.reason ?? "").slice(0, 500) || null, new Date().toISOString());
  return c.json({ ok: true, status: "pending" });
});

// 내 신청 상태
authRouter.get("/citizen-apply", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const u = await sessionUser(db, bearerToken(c));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  return c.json({ application: await myApplication(db, u.id) });
});
```

- [ ] **Step 6: 검증 + Commit**

Run: `cd /Applications/taean/backend && npx vitest run tests/citizen_applications.test.ts && npx tsc --noEmit 2>&1 | grep -E "applications.ts|auth/router.ts" || echo OK`
Expected: PASS, "OK".

```bash
cd /Applications/taean/backend
git add ../db/migrations/036_citizen_applications.sql src/citizen/applications.ts src/auth/router.ts tests/citizen_applications.test.ts
git commit -m "feat(citizen): 시민기자 신청 대기열(036·리포지토리·회원 신청 엔드포인트)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 백엔드 — 관리자 결정 엔드포인트 + 강등 보호

**Files:**
- Modify: `backend/src/auth/roles.ts`(canModifyUser)
- Create: `backend/src/citizen/applications_router.ts`
- Modify: `backend/src/auth/admin_router.ts`(강등 보호), `backend/src/index.ts`(마운트)
- Test: `backend/tests/auth_roles.test.ts`(canModifyUser 추가)

**Interfaces:**
- Consumes: `decisionToStatus`·`shouldPromoteToCitizen`(Task 1), `sessionUser`·`bearerToken`·`deriveRequesterRole`(session_guard), `canAssignRole`(roles).
- Produces:
  - `canModifyUser(requesterRole: string, targetRole: string): boolean` — 요청자가 대상 등급을 변경할 수 있는가(대상이 상위면 false).
  - `GET /api/admin/citizen-applications?status=` — 신청 목록(이메일 조인).
  - `POST /api/admin/citizen-applications/:id` — `{decision:"approve"|"reject", reason?}`.

- [ ] **Step 1: Write failing test (canModifyUser)**

`backend/tests/auth_roles.test.ts`에 describe 추가:

```ts
import { canModifyUser } from "../src/auth/roles";
describe("canModifyUser — 강등 보호", () => {
  it("동급 이하만 변경 가능, 상위는 불가", () => {
    expect(canModifyUser("superadmin", "admin")).toBe(true);
    expect(canModifyUser("admin", "citizen")).toBe(true);
    expect(canModifyUser("admin", "reporter")).toBe(true);
    expect(canModifyUser("admin", "superadmin")).toBe(false); // 상위 강등 차단
    expect(canModifyUser("admin", "admin")).toBe(true);       // 동급 허용
    expect(canModifyUser("user", "user")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `cd /Applications/taean/backend && npx vitest run tests/auth_roles.test.ts`
Expected: FAIL — `canModifyUser` 미존재.

- [ ] **Step 3: canModifyUser 구현**

`backend/src/auth/roles.ts` 끝에 추가:

```ts
// 요청자가 대상(현재 등급)을 변경할 수 있는가 — 대상이 요청자보다 상위면 불가(강등 보호).
export function canModifyUser(requesterRole: string, targetRole: string): boolean {
  const req = ROLE_RANK[requesterRole as Role];
  const tgt = ROLE_RANK[targetRole as Role];
  if (req === undefined) return false;
  return tgt === undefined || req >= tgt;
}
```

- [ ] **Step 4: 강등 보호 배선(admin_router.ts /set)**

`backend/src/auth/admin_router.ts`의 `/set` 핸들러에서, role 변경 전 대상의 현재 등급을 조회해 `canModifyUser` 확인. import에 `canModifyUser` 추가. `p` 파싱 직후:

```ts
// 대상의 현재 등급을 조회해 강등 보호(요청자보다 상위 대상 변경 금지).
const target = await db.prepare("SELECT role FROM users WHERE id=?").bind(p.data.id).first<{ role: string }>();
if (!target) return c.json({ error: "not_found" }, 404);
if (!canModifyUser(requesterRole, target.role)) {
  return c.json({ error: "insufficient_privilege", hint: "상위 등급 회원은 변경할 수 없음" }, 403);
}
```
(이 블록은 기존 `requesterRole` 계산 이후, `canAssignRole` 검사와 함께 둔다.)

- [ ] **Step 5: 관리자 결정 라우터**

Create `backend/src/citizen/applications_router.ts`:

```ts
// 관리자 — 시민기자 신청 목록/결정. adminGuard 하위 마운트(/api/admin/citizen-applications).
import { Hono } from "hono";
import type { Env } from "../types";
import { decisionToStatus, shouldPromoteToCitizen } from "./applications";
import { sessionUser, bearerToken } from "../auth/session_guard";

export const citizenAppsRouter = new Hono<{ Bindings: Env }>();

// 목록(?status=pending|approved|rejected, 기본 전체). users 조인으로 이메일.
citizenAppsRouter.get("/", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const status = c.req.query("status");
  const base =
    "SELECT a.id, a.user_id, a.status, a.reason, a.applied_at, a.decided_at, u.email, u.role FROM citizen_applications a JOIN users u ON u.id=a.user_id";
  const q = status ? `${base} WHERE a.status=?1 ORDER BY a.applied_at DESC` : `${base} ORDER BY a.applied_at DESC`;
  const stmt = status ? db.prepare(q).bind(status) : db.prepare(q);
  const r = await stmt.all();
  return c.json({ applications: r.results ?? [] });
});

// 결정 {decision, reason?}. 승인이고 대상이 user면 role=citizen 승격.
citizenAppsRouter.post("/:id", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const id = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => ({}))) as { decision?: "approve" | "reject"; reason?: string };
  if (body.decision !== "approve" && body.decision !== "reject") return c.json({ error: "invalid_input" }, 400);
  const app = await db.prepare("SELECT user_id FROM citizen_applications WHERE id=?").bind(id).first<{ user_id: number }>();
  if (!app) return c.json({ error: "not_found" }, 404);
  const decider = await sessionUser(db, bearerToken(c));
  const now = new Date().toISOString();
  await db
    .prepare("UPDATE citizen_applications SET status=?1, reason=COALESCE(?2, reason), decided_at=?3, decided_by=?4 WHERE id=?5")
    .bind(decisionToStatus(body.decision), body.reason ?? null, now, decider?.id ?? null, id)
    .run();
  if (body.decision === "approve") {
    const u = await db.prepare("SELECT role FROM users WHERE id=?").bind(app.user_id).first<{ role: string }>();
    if (u && shouldPromoteToCitizen("approve", u.role)) {
      await db.prepare("UPDATE users SET role='citizen' WHERE id=?").bind(app.user_id).run();
    }
  }
  return c.json({ ok: true });
});
```

`backend/src/index.ts`에 마운트(다른 `/api/admin/*` 옆):
```ts
import { citizenAppsRouter } from "./citizen/applications_router";
app.route("/api/admin/citizen-applications", citizenAppsRouter);
```

- [ ] **Step 6: 검증 + Commit**

Run: `cd /Applications/taean/backend && npx vitest run tests/auth_roles.test.ts && npx tsc --noEmit 2>&1 | grep -E "roles.ts|applications_router.ts|admin_router.ts|index.ts" || echo OK`
Expected: PASS, "OK".

```bash
cd /Applications/taean/backend
git add src/auth/roles.ts src/citizen/applications_router.ts src/auth/admin_router.ts src/index.ts tests/auth_roles.test.ts
git commit -m "feat(citizen): 관리자 신청 결정 엔드포인트 + 강등 보호(canModifyUser)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 프런트 — 신청 클라이언트 + 회원 신청 진입점

**Files:**
- Create: `web/src/lib/api/citizen-apply.ts`, `web/src/components/me/citizen-apply.tsx`
- Modify: `web/src/app/me/page.tsx`

**Interfaces:**
- Consumes: `apiFetch`(client), `getSession`(auth).
- Produces: `applyCitizen(reason)`·`getMyApplication()` 클라이언트; `<CitizenApply/>` 위젯(현재 등급/신청 상태에 따라 버튼 또는 상태 표시).

- [ ] **Step 1: 클라이언트**

Create `web/src/lib/api/citizen-apply.ts`:

```ts
import { apiFetch } from "./client";

export interface MyCitizenApp { id: number; status: "pending" | "approved" | "rejected"; reason: string | null; applied_at: string }

export const applyCitizen = (reason?: string) =>
  apiFetch<{ ok: boolean; status: string }>("/api/auth/citizen-apply", { method: "POST", body: JSON.stringify({ reason }) });

export const getMyApplication = () =>
  apiFetch<{ application: MyCitizenApp | null }>("/api/auth/citizen-apply");
```

- [ ] **Step 2: 신청 위젯**

Create `web/src/components/me/citizen-apply.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/api/auth";
import { applyCitizen, getMyApplication, type MyCitizenApp } from "@/lib/api/citizen-apply";

const STATUS_LABEL: Record<string, string> = { pending: "심사 중", approved: "승인됨", rejected: "반려됨" };

export function CitizenApply() {
  const [role, setRole] = useState<string | null>(null);
  const [app, setApp] = useState<MyCitizenApp | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => {
    getSession().then((a) => setRole(a?.role ?? null)).catch(() => {});
    getMyApplication().then((r) => setApp(r.application)).catch(() => {});
  }, []);
  if (role === null) return null; // 비로그인/로딩
  if (role !== "user") return null; // 이미 시민기자 이상이면 숨김

  async function submit() {
    setBusy(true);
    try { await applyCitizen(reason.trim() || undefined); setApp({ id: 0, status: "pending", reason: reason.trim() || null, applied_at: "" }); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-brand/20 bg-background p-4 text-sm">
      <p className="mb-2 font-semibold text-brand">🖊 시민기자 신청</p>
      {app && app.status !== "rejected" ? (
        <p className="text-foreground-muted">신청 상태: <strong className="text-brand">{STATUS_LABEL[app.status] ?? app.status}</strong>{app.status === "approved" ? " — 이제 글을 투고할 수 있습니다." : " — 관리자 승인을 기다리는 중입니다."}</p>
      ) : (
        <div className="space-y-2">
          {app?.status === "rejected" && <p className="text-xs text-red-600">이전 신청이 반려되었습니다{app.reason ? `: ${app.reason}` : ""}. 다시 신청할 수 있습니다.</p>}
          <p className="text-foreground-muted">태안 소식을 직접 취재·투고하고 싶으신가요? 신청하면 관리자 승인 후 글쓰기가 열립니다.</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="신청 사유(선택)" className="w-full rounded border border-brand/20 bg-background px-2 py-1 text-xs" />
          <button type="button" onClick={submit} disabled={busy} className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60">{busy ? "신청 중…" : "시민기자 신청"}</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: /me에 삽입**

`web/src/app/me/page.tsx`의 `MePageContent` 본문 적절한 위치(예: 헤더 아래)에 `<CitizenApply />` 렌더. import 추가: `import { CitizenApply } from "@/components/me/citizen-apply";`

- [ ] **Step 4: 검증 + Commit**

Run: `cd /Applications/taean/web && npm run build 2>&1 | tail -6 && npx vitest run`
Expected: 빌드 성공, 순수 lib 테스트 회귀 없음.

```bash
cd /Applications/taean/web
git add src/lib/api/citizen-apply.ts src/components/me/citizen-apply.tsx src/app/me/page.tsx
git commit -m "feat(web): 시민기자 신청 진입점(/me) + 신청 클라이언트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 프런트 — 관리자 신청 대기열 + 등급 셀렉트 확장

**Files:**
- Modify: `web/src/lib/api/admin.ts`(신청 목록/결정 클라이언트), `web/src/app/admin/page.tsx`(대기열 UI + role 옵션)

**Interfaces:**
- Consumes: `apiFetch`, `getSession`·`hasRole`(등급 셀렉트 권한 판정).
- Produces: `getCitizenApplications(status?)`·`decideCitizenApplication(id, decision, reason?)`; 👥회원 탭에 신청 대기열 블록 + role 셀렉트에 `시민기자` 추가.

- [ ] **Step 1: 클라이언트(admin.ts)**

`web/src/lib/api/admin.ts`에 추가:

```ts
export interface CitizenApp { id: number; user_id: number; status: string; reason: string | null; applied_at: string; email: string; role: string }
export const getCitizenApplications = (status?: string) =>
  apiFetch<{ applications: CitizenApp[] }>(`/api/admin/citizen-applications${status ? `?status=${status}` : ""}`);
export const decideCitizenApplication = (id: number, decision: "approve" | "reject", reason?: string) =>
  apiFetch<{ ok: boolean }>(`/api/admin/citizen-applications/${id}`, { method: "POST", body: JSON.stringify({ decision, reason }) });
```

- [ ] **Step 2: 등급 셀렉트에 시민기자 추가**

`web/src/app/admin/page.tsx` `UsersSection`의 role `<select>` 옵션에 시민기자 추가:
```tsx
<option value="user">일반</option><option value="citizen">시민기자</option><option value="reporter">기자</option><option value="admin">관리자</option>
```
(백엔드가 `canAssignRole`·`canModifyUser`로 권한을 강제하므로, 권한 없는 변경은 403이 되고 UI는 실패 시 안내한다. `patch` 실패 시 에러 표시가 없으면 `catch`로 간단한 alert/에러 상태 추가.)

- [ ] **Step 3: 신청 대기열 블록(UsersSection 상단)**

`UsersSection`에 시민기자 신청 대기열을 추가한다. 상태·핸들러:
```tsx
import { getCitizenApplications, decideCitizenApplication, type CitizenApp } from "@/lib/api/admin";
// UsersSection 내부:
const [apps, setApps] = useState<CitizenApp[]>([]);
const loadApps = () => getCitizenApplications("pending").then((r) => setApps(r.applications)).catch(() => {});
useEffect(() => { loadApps(); }, []);
async function decide(id: number, decision: "approve" | "reject") {
  const reason = decision === "reject" ? (window.prompt("반려 사유(선택):") ?? undefined) : undefined;
  await decideCitizenApplication(id, decision, reason);
  await loadApps();
}
```
렌더(회원 표 위):
```tsx
<div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
  <p className="mb-2 text-sm font-semibold text-brand">🖊 시민기자 신청 대기 {apps.length}건</p>
  {apps.length === 0 ? <p className="text-xs text-foreground-muted">대기 중인 신청이 없습니다.</p> : (
    <ul className="space-y-1 text-sm">
      {apps.map((a) => (
        <li key={a.id} className="flex items-center gap-2">
          <span className="flex-1">{a.email}{a.reason ? ` — ${a.reason}` : ""}</span>
          <button type="button" onClick={() => void decide(a.id, "approve")} className="rounded bg-brand px-2 py-0.5 text-xs text-background">승인</button>
          <button type="button" onClick={() => void decide(a.id, "reject")} className="rounded border border-brand/20 px-2 py-0.5 text-xs">반려</button>
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 4: 검증 + Commit**

Run: `cd /Applications/taean/web && npm run build 2>&1 | tail -6 && npx vitest run`
Expected: 빌드 성공, 회귀 없음.
스모크(보고서 기재): (배포 후) 회원이 /me에서 신청 → 관리자 👥회원 탭 대기열에 노출 → 승인 시 그 회원 role=citizen. 관리자가 상위(superadmin) 등급 변경 시도 시 403.

```bash
cd /Applications/taean/web
git add src/lib/api/admin.ts src/app/admin/page.tsx
git commit -m "feat(web): 관리자 시민기자 신청 대기열 + 등급 셀렉트에 시민기자

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 통합 확인(계획 완료 후)

- [ ] `cd /Applications/taean/backend && npx vitest run` + `cd /Applications/taean/web && npx vitest run && npm run build` — 회귀 없음.
- [ ] 원격 036 적용(사용자 승인): `cd /Applications/taean/backend && npx wrangler d1 execute taean-archive --remote --file db/migrations/036_citizen_applications.sql`.
- [ ] 배포(사용자 승인): 백엔드 `wrangler deploy` + 프런트 `npm run deploy:cf`.
- [ ] 라이브 스모크: 회원 신청→관리자 승인→citizen 승격→/write 접근 가능(Plan 4 전이라 /citizen). 강등 보호(admin이 superadmin 변경 403).

## 산출물(다음 계획 전제)

- `citizen` 등급 부여 경로 완성 → Plan 4(`/write` citizen 게이트)가 실제 citizen 사용자로 동작.
- 강등 보호(canModifyUser)로 Plan 1 이월 해소.
