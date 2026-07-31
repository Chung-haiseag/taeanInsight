# /write 통합 투고 에디터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시민기자 이상이 `/write`에서 AI 보조로 작성→검수 큐 투고하는 통합 에디터를 만들고, `/citizen/write`·`/reporter/write`를 `/write`로 리다이렉트한다. 일반회원에겐 시민기자 신청 안내를 보여준다.

**Architecture:** 기존 시민기자 에디터(747줄, copilot+거버넌스+검수큐)를 재사용 컴포넌트 `components/write/copilot-editor.tsx`로 추출하고, `/write` 라우트가 `RequireRole minRole="citizen"`으로 감싸 렌더한다. 구 경로 2개는 `/write`로 리다이렉트(reporter 초안 핸드오프는 sessionStorage로 보존). RequireRole의 등급부족 화면은 citizen 게이트에서 "시민기자 신청" 안내로 유도.

**Tech Stack:** Next.js(App Router)·React, vitest(순수 lib), Tailwind. 기존 copilot API·검수 큐 재사용(신규 파이프라인 없음).

## 전체 로드맵(이 계획은 4/4 — 마지막)

1. 접근제어 기반(백엔드) — 완료·배포.
2. 프런트 계층 반영 — 완료·배포.
3. 회원관리 + 시민기자 신청/승인 — 완료·배포.
4. **`/write` 통합 투고 에디터** ← 이 문서

## Global Constraints

- Cloudflare 전용. 기존 copilot(`@/lib/api/copilot`)·citizen-articles(`@/lib/api/citizen-articles`)·거버넌스·HITL 검수 큐를 **재사용**한다. 새 제출 파이프라인을 만들지 않는다.
- 에디터 로직은 **이동/재사용**하되 **재작성 금지** — 기존 동작(copilotDraft·copilotAssist·copilotCheck·copilotRelated·copilotUploadImage, createArticle→updateArticle→submitArticle)을 그대로 보존.
- `/write`는 `citizen` 이상(RequireRole minRole="citizen"). 일반회원(user)은 "시민기자 신청"(/me) 안내.
- 구 경로 `/citizen/write`·`/reporter/write`는 `/write`로 리다이렉트. reporter 초안 핸드오프(sessionStorage `reporter-article-draft`)는 보존.
- 프런트 검증: `npm run build`(타입·컴파일) + 명시 스모크. 순수 lib 없으면 build로.
- 배포는 절대경로 cwd(`cd /Applications/taean/web && npm run deploy:cf`), 사용자 승인 후. 커밋 메시지 끝 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- Create `web/src/components/write/copilot-editor.tsx` — 기존 시민기자 에디터 본문+서브컴포넌트 이동, `export function CopilotEditor()`.
- Create `web/src/app/write/page.tsx` — RequireRole citizen + Suspense + `<CopilotEditor/>`.
- Modify `web/src/app/citizen/write/page.tsx` — `/write`로 리다이렉트.
- Modify `web/src/app/reporter/write/page.tsx` — `/write`로 리다이렉트.
- Modify `web/src/components/require-role.tsx` — 등급부족 안내에 선택적 힌트(신청 유도) prop.

---

### Task 1: 에디터 컴포넌트 추출 + /write 라우트

**Files:**
- Create: `web/src/components/write/copilot-editor.tsx`, `web/src/app/write/page.tsx`
- Modify: `web/src/app/citizen/write/page.tsx`(추출된 컴포넌트 사용으로 전환)

**Interfaces:**
- Produces: `export function CopilotEditor(): JSX.Element` — 기존 `CopilotEditorPage`와 동일 동작(copilot·거버넌스·검수 제출). 내부 서브컴포넌트(BodyPreview·GovernancePanel·AssistPanel·PreSubmitChecklist·RelatedPanel)도 함께 이동.

- [ ] **Step 1: 에디터 추출**

`web/src/app/citizen/write/page.tsx`의 내용 중 **에디터 본체**를 `web/src/components/write/copilot-editor.tsx`로 이동한다(재작성 금지, 그대로 이동):
- 최상단 `"use client";` + 관련 import(Suspense·useEffect·useRef·useState·Link·useSearchParams·citizen-articles·archive·PageHeader·Icon·copilot* 전부)를 새 파일로 옮긴다.
- `function CopilotEditorPage()`를 `export function CopilotEditor()`로 이름 변경해 이동.
- 서브컴포넌트 `BodyPreview`·`GovernancePanel`·`AssistPanel`·`PreSubmitChecklist`·`RelatedPanel`과 이 파일에만 쓰이는 타입/상수도 함께 이동.
- `useSearchParams`를 쓰므로 컴포넌트는 상위에서 `<Suspense>`로 감싸질 것을 전제(자체 Suspense 불필요).

`web/src/app/citizen/write/page.tsx`는 (이 태스크에서는 임시로) 추출 컴포넌트를 렌더해 **기존 동작 유지**:
```tsx
"use client";
import { Suspense } from "react";
import { CopilotEditor } from "@/components/write/copilot-editor";
export default function CitizenWritePage() {
  return <Suspense fallback={null}><CopilotEditor /></Suspense>;
}
```

- [ ] **Step 2: /write 라우트**

Create `web/src/app/write/page.tsx`:
```tsx
import { Suspense } from "react";
import { RequireRole } from "@/components/require-role";
import { CopilotEditor } from "@/components/write/copilot-editor";

export const metadata = { title: "투고 에디터 — 태안 인사이트" };

export default function WritePage() {
  return (
    <RequireRole minRole="citizen">
      <Suspense fallback={null}><CopilotEditor /></Suspense>
    </RequireRole>
  );
}
```
(RequireRole은 클라이언트, 서버 컴포넌트 page가 렌더 가능. metadata 유지.)

- [ ] **Step 3: 검증**

Run: `cd /Applications/taean/web && npm run build 2>&1 | tail -10`
Expected: 빌드 성공(에러 0). `/write`·`/citizen/write` 두 경로 모두 컴파일. 타입 에러 없음.
스모크(보고서 기재): `/citizen/write`가 이전과 동일하게 에디터 표시(추출 후 동작 보존). `/write`는 citizen 미만이면 RequireRole 안내.

- [ ] **Step 4: Commit**

```bash
cd /Applications/taean/web
git add src/components/write/copilot-editor.tsx src/app/write/page.tsx src/app/citizen/write/page.tsx
git commit -m "feat(web): 투고 에디터 컴포넌트 추출 + /write 라우트(citizen+)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 구 경로 리다이렉트 + reporter 핸드오프 보존

**Files:**
- Modify: `web/src/app/citizen/write/page.tsx`, `web/src/app/reporter/write/page.tsx`
- Modify: `web/src/components/write/copilot-editor.tsx`(reporter 초안 흡수)

**Interfaces:**
- Consumes: `CopilotEditor`(Task 1).
- Produces: `/citizen/write`·`/reporter/write` → `/write` 리다이렉트. reporter가 `/reporter`에서 넘긴 초안(`sessionStorage["reporter-article-draft"]`)이 `/write` 에디터에 반영.

- [ ] **Step 1: reporter 초안 흡수(에디터)**

`web/src/components/write/copilot-editor.tsx`의 초기화 `useEffect`에, 기존 초안 로딩과 별개로 `sessionStorage["reporter-article-draft"]`가 있으면 본문(body)에 채우고 키를 제거하는 처리를 추가(있을 때만, 기존 citizen 초안 로직 뒤). 예:
```tsx
try {
  const handoff = sessionStorage.getItem("reporter-article-draft");
  if (handoff) { setBody((b) => b || handoff); sessionStorage.removeItem("reporter-article-draft"); }
} catch { /* 무시 */ }
```
(정확한 body 상태 setter 이름은 추출된 코드 기준으로 맞춘다.)

- [ ] **Step 2: 리다이렉트 페이지**

`web/src/app/citizen/write/page.tsx`를 리다이렉트로 교체(서버 컴포넌트):
```tsx
import { redirect } from "next/navigation";
export default function CitizenWriteRedirect() {
  redirect("/write");
}
```

`web/src/app/reporter/write/page.tsx`도 동일하게 교체(초안은 sessionStorage로 보존되므로 리다이렉트만):
```tsx
import { redirect } from "next/navigation";
export default function ReporterWriteRedirect() {
  redirect("/write");
}
```

- [ ] **Step 3: 검증**

Run: `cd /Applications/taean/web && npm run build 2>&1 | tail -10`
Expected: 빌드 성공. `/citizen/write`·`/reporter/write`가 `/write`로 리다이렉트되는 서버 컴포넌트로 컴파일.
스모크(보고서 기재): `/citizen/write` 접속 → `/write`. `/reporter`에서 초안 넘긴 뒤 `/reporter/write` → `/write`에서 본문에 초안 반영.

- [ ] **Step 4: Commit**

```bash
cd /Applications/taean/web
git add src/app/citizen/write/page.tsx src/app/reporter/write/page.tsx src/components/write/copilot-editor.tsx
git commit -m "feat(web): /citizen/write·/reporter/write → /write 리다이렉트(초안 핸드오프 보존)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 일반회원 시민기자 신청 안내(RequireRole 힌트)

**Files:**
- Modify: `web/src/components/require-role.tsx`

**Interfaces:**
- Produces: `RequireRole`에 선택적 `deniedHint?: { text: string; href: string; label: string }` prop. 있으면 등급부족 화면에 그 안내·링크를 표시. `/write`는 시민기자 신청 유도.

- [ ] **Step 1: RequireRole에 힌트 prop**

`web/src/components/require-role.tsx`의 시그니처와 denied 렌더를 확장:
```tsx
export function RequireRole({ minRole, deniedHint, children }: {
  minRole: Role;
  deniedHint?: { text: string; href: string; label: string };
  children: React.ReactNode;
}) {
  // …기존 로직 그대로…
  if (gate === "denied")
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-bold text-brand">접근 권한이 없습니다</h1>
        <p className="text-sm text-foreground-muted">{deniedHint?.text ?? "이 메뉴는 상위 등급 회원 전용입니다."}</p>
        <Link href={deniedHint?.href ?? "/membership"} className="inline-flex rounded-full border border-brand/20 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/5">{deniedHint?.label ?? "멤버십 안내"}</Link>
      </div>
    );
  // …나머지 그대로…
}
```

- [ ] **Step 2: /write에 신청 안내 연결**

`web/src/app/write/page.tsx`의 `RequireRole`에 힌트 추가:
```tsx
<RequireRole minRole="citizen" deniedHint={{ text: "글 투고는 시민기자 이상만 가능합니다. 내 페이지에서 시민기자를 신청하세요.", href: "/me", label: "시민기자 신청하러 가기" }}>
```

- [ ] **Step 3: 검증**

Run: `cd /Applications/taean/web && npm run build 2>&1 | tail -8`
Expected: 빌드 성공(에러 0).
스모크(보고서 기재): 일반회원(user)이 `/write` 접속 → "시민기자 이상만" 안내 + `/me` 링크. citizen 이상은 에디터 표시. 기존 다른 RequireRole 사용처(query·reports·me·reporter)는 deniedHint 없어 기본 문구 유지(무회귀).

- [ ] **Step 4: Commit**

```bash
cd /Applications/taean/web
git add src/components/require-role.tsx src/app/write/page.tsx
git commit -m "feat(web): /write 등급부족 시 시민기자 신청 안내(RequireRole 힌트)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 통합 확인(계획 완료 후)

- [ ] `cd /Applications/taean/web && npx vitest run && npm run build` — 회귀 없음, 빌드 성공.
- [ ] 배포(사용자 승인): `cd /Applications/taean/web && npm run deploy:cf`.
- [ ] 라이브 스모크: citizen 계정으로 `/write` 투고(작성→검수 제출) 정상. user 계정 `/write` → 신청 안내. `/citizen/write`·`/reporter/write` → `/write` 리다이렉트. 관리자 검수 큐에 투고 표시.

## 산출물

- 계층 시스템 완결: 비로그인→회원→시민기자(투고)→기자→관리자→최종관리자 전 흐름 라이브.
- 에디터 3벌 → 1벌(`/write`), 진입점 통일.
