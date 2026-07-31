# 프런트 계층 반영 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프런트에서 회원 등급(비로그인<user<citizen<reporter<admin<superadmin)에 따라 메뉴를 노출하고, 상위 라우트 접근을 클라이언트 가드로 보호하며, 관리자 콘솔을 세션 role 기반으로 전환한다(토큰 붙여넣기는 비상용으로 강등).

**Architecture:** 순수 역할·메뉴 로직(`lib/roles.ts`·`lib/nav.ts`)을 분리해 TDD하고, 화면 배선(site-header·라우트 가드·admin 게이트·login redirect)은 그 로직 + `getSession()`(=`/api/auth/me`의 role)으로 구성한다. 로그인 세션 토큰 키를 통일해 admin API가 세션 Bearer로 인증되게 한다(Plan 1의 adminGuard 세션 브리지 활용).

**Tech Stack:** Next.js(App Router)·React·OpenNext on Workers, vitest(순수 lib), Tailwind.

## 전체 로드맵(이 계획은 2/4)

1. 접근제어 기반(백엔드) — **완료**(main).
2. **프런트 계층 반영** ← 이 문서
3. 회원관리 + 시민기자 신청/승인(036 마이그레이션·API·UI)
4. `/write` 통합 투고 에디터

## Global Constraints

- Cloudflare 전용(Workers/Pages). Vercel·Firebase 금지.
- **메뉴 가시성·라우트 가드는 클라이언트(UX)**, 민감 **데이터**는 서버가 강제(Plan 1 adminGuard·후속 requireSessionRole). 클라 가드는 보안 경계가 아니라 사용성.
- 역할 순위(백엔드 `backend/src/auth/roles.ts`와 동일): user(0)<citizen(1)<reporter(2)<admin(3)<superadmin(4). 미지 role→하위 취급.
- 웹 로그인 세션 토큰은 **불투명 토큰**이며 `auth.ts`가 `localStorage["taean-auth-token"]`에 저장. role은 `getSession()`(=`/api/auth/me`)이 반환, `cachedRole()`이 `localStorage["taean-role"]`에 캐시.
- **비로그인 메뉴는 홈·뉴스·실시간·멤버십 4개만.** 회원부터 AI질의(/query)·리포트(/reports)·내 페이지(/me)·시민기자(/citizen). 기자부터 취재알림(/reporter). 관리자는 /admin.
- 프런트 테스트 관례: **순수 lib는 vitest로 TDD**, 컴포넌트/화면 배선은 컴포넌트 테스트 하네스가 없으므로 `npm run build`(타입체크·컴파일) + 명시 스모크로 검증.
- 배포는 절대경로 cwd(`cd /Applications/taean/web && npm run deploy:cf`), 사용자 승인 후. 빌드/테스트: `cd /Applications/taean/web && npm run build` / `npx vitest run <파일>`.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- Create `web/src/lib/roles.ts` — 순수: `Role`·`ROLE_RANK`·`hasRole`(백엔드 미러).
- Create `web/src/lib/nav.ts` — 순수: `NavItem`·`NAV_ITEMS`(minRole 포함)·`visibleNav(role)`.
- Create `web/src/lib/nav.test.ts` — roles·nav 단위 테스트.
- Create `web/src/components/require-role.tsx` — 클라이언트 라우트 가드.
- Modify `web/src/components/site-header.tsx` — `visibleNav`로 등급별 메뉴.
- Modify `web/src/lib/api/client.ts:8` — 세션 토큰 키를 `taean-auth-token`으로 통일.
- Modify `web/src/app/login/login-client.tsx`(로그인 폼) — `?redirect=` 지원.
- Modify `web/src/app/query/…`·`/reports/…`·`/me/…`·`/citizen/…`·`/reporter/…` 페이지 — `RequireRole`로 감싸기.
- Modify `web/src/app/admin/page.tsx`·`web/src/app/admin/kg/page.tsx` — 세션 role 게이트 + 토큰 붙여넣기 접기.

---

### Task 1: 순수 역할·메뉴 로직 (roles.ts + nav.ts)

**Files:**
- Create: `web/src/lib/roles.ts`, `web/src/lib/nav.ts`
- Test: `web/src/lib/nav.test.ts`

**Interfaces:**
- Produces:
  - `roles.ts`: `type Role`, `ROLE_RANK: Record<Role, number>`, `hasRole(userRole: string | null | undefined, minRole: Role): boolean`.
  - `nav.ts`: `interface NavItem { href: string; label: string; minRole: Role | null }`(null=비로그인 노출), `NAV_ITEMS: NavItem[]`, `visibleNav(role: string | null | undefined): NavItem[]`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hasRole } from "./roles";
import { visibleNav, NAV_ITEMS } from "./nav";

describe("hasRole (프런트 미러)", () => {
  it("동급/상위 통과, 하위·미지·비로그인 실패", () => {
    expect(hasRole("admin", "citizen")).toBe(true);
    expect(hasRole("user", "citizen")).toBe(false);
    expect(hasRole(null, "user")).toBe(false);
    expect(hasRole("editor", "user")).toBe(false);
  });
});

describe("visibleNav — 등급별 메뉴", () => {
  const hrefs = (role: string | null) => visibleNav(role).map((i) => i.href);
  it("비로그인은 홈/뉴스/실시간/멤버십 계열만(회원 전용 미노출)", () => {
    const v = hrefs(null);
    expect(v).toContain("/live");
    expect(v).toContain("/news");
    expect(v).toContain("/membership");
    expect(v).not.toContain("/query");
    expect(v).not.toContain("/reports");
    expect(v).not.toContain("/me");
    expect(v).not.toContain("/reporter");
  });
  it("일반회원은 AI질의·리포트·내페이지·시민기자 추가, 취재알림은 미노출", () => {
    const v = hrefs("user");
    expect(v).toContain("/query");
    expect(v).toContain("/reports");
    expect(v).toContain("/me");
    expect(v).toContain("/citizen");
    expect(v).not.toContain("/reporter");
  });
  it("기자는 취재알림까지 노출", () => {
    expect(hrefs("reporter")).toContain("/reporter");
  });
  it("모든 항목에 minRole 필드가 있다(null 허용)", () => {
    for (const i of NAV_ITEMS) expect("minRole" in i).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Applications/taean/web && npx vitest run src/lib/nav.test.ts`
Expected: FAIL — `Cannot find module './roles'` / `'./nav'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/lib/roles.ts`:

```ts
// 회원 등급 순수 로직 — 백엔드 backend/src/auth/roles.ts의 프런트 미러(가시성/가드용).
//   순위: user < citizen < reporter < admin < superadmin. 미지·비로그인은 하위 취급.

export const ROLE_VALUES = ["user", "citizen", "reporter", "admin", "superadmin"] as const;
export type Role = (typeof ROLE_VALUES)[number];

export const ROLE_RANK: Record<Role, number> = {
  user: 0,
  citizen: 1,
  reporter: 2,
  admin: 3,
  superadmin: 4,
};

// userRole이 minRole 이상이면 true. null·미지 role은 false.
export function hasRole(userRole: string | null | undefined, minRole: Role): boolean {
  if (!userRole) return false;
  const r = ROLE_RANK[userRole as Role];
  return r !== undefined && r >= ROLE_RANK[minRole];
}
```

Create `web/src/lib/nav.ts`:

```ts
// 주요 메뉴 정의 + 등급별 노출 필터. minRole=null 은 비로그인 포함 전체 노출.
import { hasRole, type Role } from "./roles";

export interface NavItem {
  href: string;
  label: string;
  minRole: Role | null;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/live", label: "지금 태안", minRole: null },
  { href: "/news", label: "뉴스아카이브", minRole: null },
  { href: "/membership", label: "멤버십", minRole: null },
  { href: "/query", label: "질의응답", minRole: "user" },
  { href: "/reports", label: "주간 리포트", minRole: "user" },
  { href: "/citizen", label: "시민기자", minRole: "user" },
  { href: "/me", label: "내 페이지", minRole: "user" },
  { href: "/reporter", label: "취재 알림", minRole: "reporter" },
];

// 현재 role로 볼 수 있는 항목만. minRole=null 은 항상 노출.
export function visibleNav(role: string | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((i) => i.minRole === null || hasRole(role, i.minRole));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Applications/taean/web && npx vitest run src/lib/nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Applications/taean/web
git add src/lib/roles.ts src/lib/nav.ts src/lib/nav.test.ts
git commit -m "feat(web): 등급별 메뉴 순수 로직(roles·nav 필터)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: site-header 등급별 메뉴

**Files:**
- Modify: `web/src/components/site-header.tsx`

**Interfaces:**
- Consumes: `visibleNav`(Task 1), `cachedRole`·`getSession`(`@/lib/api/auth`).
- Produces: 헤더가 현재 role로 `visibleNav`를 렌더(데스크톱·모바일 공용). 비로그인은 3항목(홈은 로고).

- [ ] **Step 1: Modify site-header.tsx**

`NAV_ITEMS`/`canSeeReporter`/`showReporter` 로직을 제거하고 `visibleNav(role)` 기반으로 교체. 상단 import 정리:

```tsx
import { visibleNav } from "@/lib/nav";
import { cachedRole, getSession } from "@/lib/api/auth";
```

컴포넌트 내부 상태·효과를 아래로 교체(기존 `showReporter`/`canSeeReporter` 대체):

```tsx
  const [role, setRole] = useState<string | null>(null);
  // 캐시 role로 즉시 렌더 후, 세션으로 최신화(로그인/등급 변경 반영)
  useEffect(() => {
    setRole(cachedRole());
    getSession().then((a) => setRole(a?.role ?? null)).catch(() => {});
  }, [pathname]);
  const navItems = visibleNav(role);
```

`navItems`를 쓰는 데스크톱/모바일 `.map()`은 그대로 두되, `item.label`·`item.href`만 참조하므로 수정 불필요. `reporterOnly` 참조가 남아 있으면 제거.

- [ ] **Step 2: 타입·빌드 검증**

Run: `cd /Applications/taean/web && npx vitest run src/lib/nav.test.ts && npm run build 2>&1 | tail -8`
Expected: 테스트 PASS, 빌드 성공(에러 0). `site-header.tsx` 관련 타입 에러 없음.

- [ ] **Step 3: 스모크(수동 확인 항목 보고서에 기재)**

개발/프리뷰에서: 비로그인 상태 헤더에 `지금 태안·뉴스아카이브·멤버십`만 보이고 `질의응답·주간 리포트·내 페이지·취재 알림`은 안 보임. 로그인(user) 후 `질의응답·주간 리포트·내 페이지·시민기자` 추가 노출.

- [ ] **Step 4: Commit**

```bash
cd /Applications/taean/web
git add src/components/site-header.tsx
git commit -m "feat(web): 헤더 메뉴를 등급별 노출로(비로그인=4개, 회원+ 확장)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 세션 토큰 키 통일 + 로그인 redirect

**Files:**
- Modify: `web/src/lib/api/client.ts:8`
- Create: `web/src/app/login/login-client.tsx`(현 `page.tsx` 폼 내용을 옮긴 클라이언트 컴포넌트)
- Modify: `web/src/app/login/page.tsx`(`<Suspense>` 래퍼로 축소)

**Interfaces:**
- Produces: `apiFetch`/`buildApiHeaders`가 **로그인 세션 토큰**(`taean-auth-token`)을 `Authorization: Bearer`로 전송 → Plan 1 adminGuard 세션 브리지가 admin 세션을 인식. 로그인 성공 시 `?redirect=` 경로로 복귀.

- [ ] **Step 1: client.ts 토큰 키 통일**

`web/src/lib/api/client.ts:8`을 교체:

```ts
// 로그인 세션 토큰 키 — auth.ts(AUTH_KEY="taean-auth-token")와 동일해야 apiFetch가 세션 Bearer를 보낸다.
const TOKEN_KEY = "taean-auth-token";
```

> 배경: 기존 `"taean-insight-access-token"`은 어디서도 세팅되지 않는 죽은 키였다. 로그인은 `taean-auth-token`에 저장하므로, apiFetch가 이 키를 읽어야 세션 Bearer가 전송된다. 불투명 세션 토큰은 JWT가 아니라, JWT `identifyUser` 경로는 검증 실패 후 `X-Taean-Uid`로 폴백하므로 공개 질의 등은 회귀 없음(스모크로 확인).

- [ ] **Step 2: 로그인 폼에 redirect 지원**

현재 로그인 폼은 `web/src/app/login/page.tsx`(이미 `"use client"`, `useRouter` 사용) 한 파일에 있다. `useSearchParams`는 Suspense 경계가 필요하므로 **폼을 `login-client.tsx`로 추출**하고 `page.tsx`를 얇은 래퍼로 만든다.

`web/src/app/login/login-client.tsx`(현 page.tsx 폼 내용 이동) 상단:

```tsx
"use client";
import { useSearchParams, useRouter } from "next/navigation";
// …기존 import(login, signup, startKakaoLogin, consumeKakaoCallback 등)
```

컴포넌트 내부에서 redirect 목적지 계산 후, 이메일 로그인·회원가입·카카오 콜백(`consumeKakaoCallback` 성공) 성공 처리부에서 모두 그 경로로 이동(현재 `/me`로 보내던 곳 교체):

```tsx
const params = useSearchParams();
const router = useRouter();
const redirectTo = params.get("redirect") || "/me";
// 성공 시:
router.replace(redirectTo);
```

`web/src/app/login/page.tsx`는 래퍼로 축소(metadata가 있으면 유지):

```tsx
import { Suspense } from "react";
import { LoginClient } from "./login-client";
export default function LoginPage() {
  return <Suspense fallback={null}><LoginClient /></Suspense>;
}
```

- [ ] **Step 3: 빌드 검증 + 스모크**

Run: `cd /Applications/taean/web && npm run build 2>&1 | tail -8`
Expected: 빌드 성공(에러 0), `/login` prerender 경고 없음(Suspense 처리).
스모크(보고서 기재): 비로그인이 `/query`에서 로그인 유도 → 로그인 후 `/query`로 복귀. 로그인 상태에서 `/query`(AI질의)가 이전처럼 동작(세션 Bearer 전송에도 회귀 없음).

- [ ] **Step 4: Commit**

```bash
cd /Applications/taean/web
git add src/lib/api/client.ts src/app/login/login-client.tsx src/app/login/page.tsx
git commit -m "feat(web): 세션 토큰 키 통일(로그인 Bearer 전송) + 로그인 redirect 복귀

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 라우트 가드 컴포넌트 + 적용

**Files:**
- Create: `web/src/components/require-role.tsx`
- Modify: `web/src/app/query/page.tsx`, `web/src/app/reports/page.tsx`, `web/src/app/me/page.tsx`, `web/src/app/citizen/page.tsx`, `web/src/app/reporter/page.tsx`

**Interfaces:**
- Consumes: `getSession`(`@/lib/api/auth`), `hasRole`·`Role`(`@/lib/roles`).
- Produces: `<RequireRole minRole={…}>children</RequireRole>` — 비로그인은 `/login?redirect=<현재>`로, 등급 부족은 안내(신청/문의) 표시, 충족 시 children.

- [ ] **Step 1: RequireRole 컴포넌트**

Create `web/src/components/require-role.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

import { getSession } from "@/lib/api/auth";
import { hasRole, type Role } from "@/lib/roles";

type Gate = "checking" | "ok" | "denied";

// 등급 가드(UX). 비로그인→/login?redirect=, 등급부족→안내, 충족→children.
export function RequireRole({ minRole, children }: { minRole: Role; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    let alive = true;
    getSession()
      .then((acct) => {
        if (!alive) return;
        if (!acct) {
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return; // checking 유지(리다이렉트 중)
        }
        setGate(hasRole(acct.role, minRole) ? "ok" : "denied");
      })
      .catch(() => {
        if (alive) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      });
    return () => { alive = false; };
  }, [minRole, pathname, router]);

  if (gate === "checking") return <p className="p-6 text-sm text-foreground-muted">확인 중…</p>;
  if (gate === "denied")
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-bold text-brand">접근 권한이 없습니다</h1>
        <p className="text-sm text-foreground-muted">이 메뉴는 상위 등급 회원 전용입니다.</p>
        <Link href="/membership" className="inline-flex rounded-full border border-brand/20 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/5">멤버십 안내</Link>
      </div>
    );
  return <>{children}</>;
}
```

- [ ] **Step 2: 게이트 적용**

각 페이지를 등급별로 `<RequireRole minRole=…>`로 감싼다. 페이지 유형이 둘로 나뉘므로 방식이 다르다:

**서버 컴포넌트 페이지(metadata export 유지)** — `query`·`reports`·`citizen`. 이들은 클라이언트 자식(예: `QueryClient`)을 렌더하므로, 그 자식을 `RequireRole`로 감싼다(서버 컴포넌트가 클라이언트 `RequireRole`를 렌더 → OK, metadata 그대로):

```tsx
// web/src/app/query/page.tsx (서버 컴포넌트, metadata 유지)
import { RequireRole } from "@/components/require-role";
// export const metadata = … (그대로)
export default function QueryPage() {
  return <RequireRole minRole="user"><QueryClient /></RequireRole>;
}
```
- `web/src/app/query/page.tsx` → `minRole="user"`(자식 QueryClient 감싸기)
- `web/src/app/reports/page.tsx` → `minRole="user"`(렌더하는 클라 자식 감싸기)
- `web/src/app/citizen/page.tsx` → `minRole="user"`(렌더하는 클라 자식 감싸기)

**클라이언트 컴포넌트 페이지(`"use client"`)** — `me`·`reporter`. 반환 본문을 직접 감싼다:

```tsx
// web/src/app/reporter/page.tsx ("use client")
import { RequireRole } from "@/components/require-role";
export default function ReporterPage() {
  return (
    <RequireRole minRole="reporter">
      {/* 기존 페이지 본문 */}
    </RequireRole>
  );
}
```
- `web/src/app/me/page.tsx` → `minRole="user"`
- `web/src/app/reporter/page.tsx` → `minRole="reporter"`. **기존 파일 내 localStorage(`taean-role`) 기반 소프트 게이트 분기는 제거**하고 RequireRole로 대체(비기자 안내는 RequireRole의 denied 화면이 담당).

- [ ] **Step 3: 빌드 검증 + 스모크**

Run: `cd /Applications/taean/web && npm run build 2>&1 | tail -8`
Expected: 빌드 성공(에러 0).
스모크(보고서 기재): 비로그인이 `/query`·`/reports`·`/me`·`/citizen`·`/reporter` URL 직접 접근 → `/login?redirect=`로 이동. 로그인(user)이 `/reporter` 접근 → "권한 없음" 안내. reporter 계정은 `/reporter` 정상.

- [ ] **Step 4: Commit**

```bash
cd /Applications/taean/web
git add src/components/require-role.tsx src/app/query/page.tsx src/app/reports/page.tsx src/app/me/page.tsx src/app/citizen/page.tsx src/app/reporter/page.tsx
git commit -m "feat(web): 등급 라우트 가드(RequireRole) + 회원 전용 페이지 적용

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: admin 콘솔 세션 게이트

**Files:**
- Modify: `web/src/app/admin/page.tsx`(AdminLogin·게이트 로직)
- Modify: `web/src/app/admin/kg/page.tsx`(토큰 게이트)

**Interfaces:**
- Consumes: `getSession`(`@/lib/api/auth`), `hasRole`(`@/lib/roles`). Task 3로 admin API가 세션 Bearer로 인증됨.
- Produces: 로그인한 `admin`/`superadmin`은 토큰 입력 없이 콘솔 진입. 그 외엔 로그인 유도 또는 "관리자 권한 필요". 토큰 붙여넣기는 접기형 "고급(비상용)"으로 잔존.

- [ ] **Step 1: admin/page.tsx 게이트 전환**

`AdminPage`의 인증 판정을 세션 role 우선으로 교체. 기존 `getCostSummary()` 시도 방식 대신:

```tsx
import { getSession } from "@/lib/api/auth";
import { hasRole } from "@/lib/roles";
// …
useEffect(() => {
  (async () => {
    const acct = await getSession().catch(() => null);
    if (acct && hasRole(acct.role, "admin")) { setAuthed(true); return; }
    // 세션 admin 아님 → 저장된 관리자 토큰이 있으면 그걸로 폴백 검증(비상용)
    try { await getCostSummary(); setAuthed(true); } catch { setAuthed(false); }
  })();
}, []);
```

`AdminLogin`(토큰 입력)을 "고급(비상용) — 관리자 토큰 직접 입력" `<details>`로 접고, 상단엔 세션 로그인 안내를 둔다: 로그인 안 됐으면 `/login?redirect=/admin` 링크, 로그인했지만 admin 아니면 "이 계정은 관리자 권한이 없습니다". 로그아웃 버튼은 세션 로그아웃(`logout()`)과 토큰 제거를 함께.

- [ ] **Step 2: admin/kg/page.tsx 동일 전환**

`web/src/app/admin/kg/page.tsx`의 토큰 게이트도 동일 패턴(세션 admin 우선, 토큰 폴백 접기)으로 교체.

- [ ] **Step 3: 빌드 검증 + 스모크**

Run: `cd /Applications/taean/web && npm run build 2>&1 | tail -8`
Expected: 빌드 성공(에러 0).
스모크(보고서 기재): (부트스트랩된) admin 계정으로 로그인 후 `/admin` 진입 시 토큰 입력 없이 콘솔 표시, 회원관리 등 admin API 호출 성공(세션 Bearer). 비admin 로그인은 "권한 없음". 토큰만 아는 사용자는 고급 접기에서 여전히 진입 가능(비상).

- [ ] **Step 4: Commit**

```bash
cd /Applications/taean/web
git add src/app/admin/page.tsx src/app/admin/kg/page.tsx
git commit -m "feat(web): admin 콘솔 세션 role 게이트(토큰 붙여넣기는 비상용 접기)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 통합 확인(계획 완료 후)

- [ ] `cd /Applications/taean/web && npx vitest run` — 순수 lib 테스트 회귀 없음 + nav.test 통과.
- [ ] `cd /Applications/taean/web && npm run build` — 빌드 성공.
- [ ] 배포(사용자 승인 후): `cd /Applications/taean/web && npm run deploy:cf`. (백엔드 Plan 1은 이 시점 배포되어 있어야 admin 세션 브리지·가드가 실제 동작.)
- [ ] 라이브 스모크: 비로그인 헤더 4개 · 회원 확장 · 상위 라우트 리다이렉트 · admin 계정 토큰 없이 콘솔.

## 이 계획의 산출물(다음 계획의 전제)

- `lib/roles.ts`·`lib/nav.ts`·`RequireRole` — Plan 3(회원관리 UI)·Plan 4(`/write` citizen 게이트)가 재사용.
- 세션 Bearer 전송 통일 — Plan 3의 회원관리 admin API 호출이 세션으로 인증.

## 주의(이월/리스크)

- **requireSessionRole↔Env tsc 검증**(Plan 1 이월): 이 계획은 프런트만이라 해당 없음. 후속 백엔드 계획에서 확인.
- 토큰 키 통일(Task 3) 후 apiFetch가 불투명 세션 토큰을 Bearer로 보낸다. `requireAuth`(JWT) 마운트 엔드포인트를 apiFetch로 호출하는 기능이 있으면 401 가능 — 현재 Bearer가 비어 있어도 이미 그 상태이므로 신규 회귀는 아니나, 스모크에서 주요 화면(질의·리포트·내페이지) 동작을 확인할 것.
