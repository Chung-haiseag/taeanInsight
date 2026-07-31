# 회원 등급·접근 계층 시스템 설계 (Membership & Access Tiers)

**작성일:** 2026-07-31
**대상:** 태안 인사이트(insight.taeannews.co.kr) — 백엔드 `taean-insight-api`, 프런트 `taean-insight`
**상태:** 설계 확정, 구현 계획 대기

## 목표(Goal)

사이트를 **비로그인 / 일반회원 / 시민기자 / 기자 / 관리자(+최종관리자)** 5+1 계층으로 구분하고, 계층별 메뉴 노출·라우트 접근을 정하며, 관리자가 회원 등급을 관리하는 체계를 만든다. 등급별 로그인 계정(아이디=이메일, 비번=본인 설정)을 발급한다.

## 배경 — 이미 있는 것(현행)

- **인증**: 이메일+비밀번호(PBKDF2, `backend/src/auth/router.ts`)와 카카오 SSO 병행. 로그인 성공 시 `createSession()`이 **불투명 세션 토큰**을 `sessions` 테이블(token·user_id·expires_at)에 발급, 프런트는 `localStorage["taean-insight-access-token"]`에 보관하고 `client.ts`가 `Authorization: Bearer`로 자동 부착.
- **역할·플랜**: `db/migrations/029_user_roles.sql` — `users.role TEXT NOT NULL DEFAULT 'user'`(현 값 user|reporter|admin, **CHECK 제약 없음**), `users.plan TEXT NOT NULL DEFAULT 'free'`(free|reader|business|org).
- **역할 조회**: `GET /api/auth/me`가 세션 토큰으로 `sessions JOIN users`하여 role·plan 반환.
- **회원관리 API**: `POST /api/admin/users`(role·plan 부여, `backend/src/auth/admin_router.ts`) — 현재 `adminGuard`(공유 토큰)로 보호. zod `role: z.enum(["user","reporter","admin"])`.
- **관리자 인증(2중)**: (a) `role==admin` 사용자 → 프런트 `/admin` 메뉴, (b) `ADMIN_TOKEN` 공유 시크릿(`X-Admin-Token`) → 백엔드 `/api/admin/*` **실제 보호**. 현재 `/admin`·`/admin/kg` 페이지는 사용자가 토큰을 붙여넣어 `localStorage["taean-admin-token"]`에 저장(`client.ts`가 `X-Admin-Token` 자동 부착).
- **AI 글쓰기(copilot)**: `backend/src/copilot/router.ts` + `web/src/lib/api/copilot.ts`(초안·다듬기·요약·관련기사·이미지 업로드). 현재 `/citizen/write`(시민기자 투고)에서만 사용. 제출 → 거버넌스(민감주제) → AI 라벨 → HITL 검수 큐.
- **미완(중요)**: `requireRole` 미들웨어는 정의돼 있으나 `citizen/router.ts`·`governance/rules_router.ts`·`review_router.ts`·`reports/router.ts`에 **아직 미적용**(PoC 공개 상태, "운영 전 적용 필수" 주석). 서버 사이드 역할 강제가 불완전.

## 전역 제약(Global Constraints)

- Cloudflare 전용(Workers/D1/R2). Vercel·Firebase·NAS 금지.
- **평문 비밀번호를 화면·명령줄·커밋에 노출 금지.** 비번은 사용자가 폼에 직접 입력하는 값만 사용, 서버는 PBKDF2 해시만 저장. 개발자(Claude)는 비번 값을 보지 않는다.
- **비밀번호 프록시 금지**: 사용자의 타 사이트(태안신문) 비밀번호를 우리 서버가 중계/저장하지 않는다.
- 프로덕션 배포·D1 대량삭제는 사용자 승인 후.
- 새 마이그레이션은 `db/migrations/036_*.sql`부터(현재 최신 035). 배포는 절대경로 cwd(`cd /Applications/taean/backend`).
- 결제형 멤버십(`plan`=free/reader/business/org)은 **별도 축, 이번 범위 밖**. 본 스펙은 권한(`role`) 축만 다룬다.

---

## 아키텍처

### 1) 권한 사다리(role) & 부여 규칙

역할은 단일 축 `users.role`로 표현(값 추가만, 컬럼 마이그레이션 불필요).

| role | 계층 | 부여 방식 | 상위 대비 추가 권한 |
|---|---|---|---|
| *(없음)* | 비로그인 | — | 홈·뉴스·실시간·멤버십 열람 |
| `user` | 일반회원 | **셀프 가입**(기본값) | +AI질의·아카이브·리포트·대시보드·내 워크스페이스·계정 |
| `citizen` | 시민기자 | **신청 → 관리자 승인** | +`/write` 투고(→검수 큐) |
| `reporter` | 기자 | **최종관리자 지정** | +취재알림, 투고는 현행 기자 정책 계승(시민기자보다 간소) |
| `admin` | 관리자 | **최종관리자 지정** | +백오피스·회원관리·시민기자 승인·검수 |
| `superadmin` | 최종관리자 | 부트스트랩(소유자 1인) | +기자·관리자 임명 |

- 새 값 `citizen`·`superadmin` 추가. `role` 컬럼은 CHECK 제약이 없어 스키마 변경 불필요 — 애플리케이션 zod 열거만 확장.
- 권한은 **누적**(상위는 하위 권한 포함). 서버 판정은 "필요 role 이상"으로(순위: user<citizen<reporter<admin<superadmin).

### 2) 계층 × 메뉴 지도

| 계층 | 노출 메뉴(라우트) |
|---|---|
| **비로그인** | `/` 홈 · `/news` 뉴스 · `/live` 실시간 · `/membership` 멤버십 · `/login` |
| **일반회원** | 위 + `/query` AI질의 · `/archive` 아카이브 · `/reports` 리포트 · `/dashboard` 대시보드 · `/me` 워크스페이스 · `/account` 계정 · (시민기자 신청 안내) |
| **시민기자** | 위 + `/write` AI 투고 에디터 |
| **기자** | 위 + `/reporter` 취재알림 · (`/reporter/write`→`/write`) |
| **관리자** | 위 + `/admin` 백오피스 · `/admin/kg` 지식그래프 |
| **최종관리자** | 관리자 전부 + 회원관리에서 기자·관리자 임명 UI 노출 |

두 겹으로 강제한다:
- **메뉴 렌더**: `site-header.tsx`가 현재 role로 항목 필터(비로그인엔 4개만). role은 로그인 후 `/api/auth/me`로 확정(현재 localStorage 힌트는 보조).
- **라우트 가드**: 계층 부족 상태로 상위 라우트 URL 직접 접근 시 → 로그인 필요면 `/login?redirect=<원경로>`, 등급 부족이면 "권한 없음/신청 안내" 페이지. 클라이언트 가드 + **민감 데이터 엔드포인트는 서버 `requireRole` 강제**(현재 미적용분 포함).

### 3) 회원관리 화면(관리자 콘솔)

`/admin` 백오피스에 "회원관리" 섹션(기존 👥회원 탭 확장).

- **회원 목록**: 이메일 · 등급(role) · plan · 가입일 · 최근 로그인 · (투고수). 검색·정렬.
- **등급 변경(권한 차등)**:
  - 일반관리자(`admin`): `user ↔ citizen`만 조정(시민기자 승인/해제 포함).
  - 최종관리자(`superadmin`): 위 + `reporter`·`admin` 임명/해제.
  - 서버가 "요청자 role"과 "대상 등급"을 검증해 월권 차단(일반관리자가 admin/reporter 부여 시 403).
- **시민기자 신청 대기열**: 상태별(대기/승인/반려) 목록, 승인·반려(사유 입력). 반려 사유는 신청자에게 표시.

### 4) `/write` 통합 투고 에디터(시민기자+)

- 대상: `citizen` 이상. 일반회원 접근 시 "시민기자 신청" 안내(신청 폼).
- 재사용: 기존 copilot(초안·다듬기·요약·관련기사·이미지) + 거버넌스(민감주제) + HITL 검수 큐. **새 파이프라인 안 만듦.**
- **role 분기**:
  - `citizen`: 제출 → 검수 큐(HITL) 필수.
  - `reporter` 이상: 기존 `/reporter/write`의 현행 기자 투고 정책 계승(시민기자보다 간소). 구체 정책은 현행 유지, 이번 스펙에서 새로 만들지 않음.
- **통합**: 현재 `/citizen/write`·`/reporter/write` 로직을 `/write` 한 곳으로 합치고 role로 분기. 구 경로는 `/write`로 리다이렉트(에디터 3벌 → 1벌).

### 5) 관리자 인증 통합(이메일+비번)

- **백엔드**: `adminGuard`(`backend/src/index.ts`)를 확장 — 다음 중 하나면 통과:
  1. `X-Admin-Token === ADMIN_TOKEN` (스크립트·크론·비상용 유지), 또는
  2. `Authorization: Bearer <세션토큰>`의 사용자가 `role ∈ {admin, superadmin}` (SQL: `sessions JOIN users WHERE token=? AND expires_at>?`).
- **임명 API 게이트**: 기자·관리자 등급 부여(`reporter`/`admin`/`superadmin`)는 **요청자 `superadmin`만**. 시민기자 승인은 `admin` 이상.
- **프런트**: `/admin`·`/admin/kg` 진입 시 `/api/auth/me`의 role로 가드(admin 미만이면 `/login` 또는 홈). 관리자 API는 **이미 저장된 세션 Bearer 토큰**으로 호출 → **토큰 붙여넣기 UI 제거**(접기형 "고급: 토큰 직접입력"만 비상용으로 잔존). `client.ts`는 세션 토큰이 있으면 X-Admin-Token 부착을 생략.

### 6) 계정 발급 절차(비번 노출 0)

1. 각 계정 이메일로 `/login`에서 **회원가입**(비번은 본인이 폼 입력).
2. **부트스트랩(1회)**: 최종관리자 계정을 D1로 승격 —
   `UPDATE users SET role='superadmin', plan='org' WHERE email='chs9182@gmail.com';`
   (비번 무관, role만. 사용자 승인 후 실행.)
3. 이후 모든 등급 지정은 **회원관리 화면**에서(시민기자=신청·승인, 기자·관리자=최종관리자 임명).

계정 스킴:

| 계층 | role | 아이디(이메일) | 비번 |
|---|---|---|---|
| 일반회원 | `user` | *(사용자 지정 또는 셀프 가입자)* | 가입 시 본인 |
| 시민기자 | `citizen` | *(신청 회원)* | 본인 |
| 기자 | `reporter` | *(실제 기자/테스트)* | 본인 |
| 최종관리자 | `superadmin` | **chs9182@gmail.com**(권장) | 본인 |

---

## 데이터 모델

### 새 마이그레이션 `db/migrations/036_citizen_applications.sql`

시민기자 신청 대기열(감사 추적 포함):

```sql
CREATE TABLE IF NOT EXISTS citizen_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  reason TEXT,                              -- 신청 사유(신청자) / 반려 사유(관리자)
  applied_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by INTEGER,                       -- 승인/반려한 관리자 user_id
  UNIQUE(user_id)                           -- 회원당 활성 신청 1건
);
CREATE INDEX IF NOT EXISTS idx_citizen_app_status ON citizen_applications(status);
```

`users.role`은 값만 확장(`citizen`, `superadmin`) — 컬럼 마이그레이션 불필요.

### 역할 순위(공용 상수)

`backend/src/auth`에 순위 헬퍼:
```
ROLE_RANK = { user:0, citizen:1, reporter:2, admin:3, superadmin:4 }
hasRole(userRole, required) = ROLE_RANK[userRole] >= ROLE_RANK[required]
```

---

## API 변경 요약

- `POST /api/auth/citizen-apply` (requireAuth) — 회원이 시민기자 신청(사유). 대기열 upsert.
- `GET /api/admin/citizen-applications` (admin+) — 신청 목록(상태 필터).
- `POST /api/admin/citizen-applications/:id` (admin+) — 승인(→role=citizen)/반려(사유).
- `POST /api/admin/users` (확장) — role 부여 시 **요청자 권한 검증**: 대상 role이 reporter/admin/superadmin이면 요청자 superadmin 필수. zod enum에 `citizen`·`superadmin` 추가.
- `adminGuard` 확장(위 5절).
- 미적용 `requireRole`을 운영 라우트에 적용(citizen 투고·governance·review·reports 등 민감 경로).

## 프런트 변경 요약

- `site-header.tsx` NAV_ITEMS를 role 기반으로 재구성(비로그인 4개 고정). role은 `/api/auth/me`.
- 라우트 가드 컴포넌트/훅: 계층 부족 시 `/login?redirect=` 또는 안내.
- `/write` 신설(통합 에디터), `/citizen/write`·`/reporter/write` 리다이렉트.
- `/admin` 회원관리 UI(목록·등급변경·시민기자 승인 대기열).
- `/admin*` 세션 기반 가드 + 토큰 붙여넣기 UI 제거(비상용 접기).
- 일반회원용 "시민기자 신청" 진입점(예: `/account` 또는 `/write` 안내).

## 에러 처리

- 등급 부족 API → `403 {error:"forbidden", required:<role>}`. 프런트는 안내/신청 유도로 변환.
- 월권 등급 부여 시도 → `403 {error:"insufficient_privilege"}`.
- 시민기자 중복 신청 → `409`(대기/이미 승인).
- 세션 만료 → `401` → 프런트 `/login?redirect=` 유도.

## 테스트(TDD)

- `hasRole`/`ROLE_RANK` 순수 로직 단위 테스트(경계: user가 citizen 요구 실패, admin이 citizen 통과, admin이 reporter-부여 월권 실패, superadmin 통과).
- `adminGuard` 분기(토큰만/세션admin/세션user/무자격) 테스트.
- 시민기자 신청→승인→role 전이 통합 테스트(대기열 상태·중복 방지).
- 라우트 가드: 비로그인이 `/query` 접근 시 리다이렉트, citizen 미만이 `/write` 접근 시 안내.

---

## 범위 밖(YAGNI)

- 결제/plan 승급 로직, 유료 등급 UI(별도 축).
- 카카오 SSO 변경(그대로 병행).
- 세밀한 권한(문서별 ACL) — role 순위로 충분.

## 후속 확장 — 태안신문 기존 회원 연동(결정 대기)

태안신문(taeannews.co.kr)은 자체 PHP 회원 시스템(`/member/login.php`), 공식 API·SSO 없음. 우리는 수집용 계정 1개만 보유(회원 DB 접근권 없음). **비밀번호는 이관 불가**(해시), 개인정보 이관은 **동의·약관 근거** 필요.

- **권장 A안(회원 DB 협조 시)**: 태안신문에서 회원 이메일/이름 목록을 받아 `users`에 `provider='taeannews'`로 사전 생성(비번 없음) → 첫 로그인 때 "이메일로 비번 설정"(재설정 링크). 동의 고지 포함.
- **B안(CMS 수정 가능 시)**: 태안신문 측 회원확인 API/SSO를 열어 로그인 시 검증·연결(비번 프록시 금지).
- **C안**: 기존 회원도 재가입(연결 없음).

→ **이 스펙의 핵심(1~6절)은 A/B/C와 독립**. 일반회원 셀프 가입으로 먼저 가동하고, 태안신문 연동은 회원 DB 접근 여부가 확정되면 별도 스펙으로 진행.

## 구현 단위(계획 분할 힌트)

규모가 크므로 구현 계획에서 다음 그룹으로 나눌 수 있다:
1. 역할 모델(zod 확장·ROLE_RANK·036 마이그레이션) + 서버 `requireRole` 적용.
2. 관리자 인증 통합(adminGuard 세션 브리지 + 프런트 세션 가드).
3. 회원관리 UI + 시민기자 신청/승인 API·화면.
4. `/write` 통합 에디터(리다이렉트·role 분기).
5. 메뉴 지도·라우트 가드(프런트).
