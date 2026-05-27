# insight.taeannews.co.kr — Next.js 프론트엔드

태안 AI 인텔리전스 커먼즈 플랫폼 웹 프론트엔드 부트스트랩 (PRD v1.5 §6 REQ-PLATFORM-001 · TaskMaster #20).

## 기술 스택

- **Next.js 14** (App Router, typedRoutes)
- **React 18** + **TypeScript** strict
- **Tailwind CSS 3** + CSS 변수 기반 동적 테마
- **Pretendard** 한글 폰트 (CDN 또는 self-host 권장)

## 디렉토리

```
web/
├── package.json
├── tsconfig.json
├── next.config.mjs           # 보안 헤더 (HSTS, X-Content-Type-Options 등)
├── tailwind.config.ts        # PRD §8.1 디자인 시스템 (네이비/오프화이트/황토)
├── postcss.config.mjs
└── src/
    ├── app/                   # App Router
    │   ├── layout.tsx
    │   ├── globals.css        # 접근성 CSS 변수 (글자 크기·고대비)
    │   ├── page.tsx           # 홈
    │   ├── reports/           # 주간 인사이트 리포트 (자리표시)
    │   ├── query/             # AI Query Agent (자리표시)
    │   ├── dashboard/         # B2B 대시보드 (자리표시)
    │   └── citizen/           # 시민기자단 안내 + 모집 정보
    └── components/
        ├── site-header.tsx
        ├── site-footer.tsx
        ├── ai-label-badge.tsx       # PRD §6 REQ-GOV-001 AI 라벨
        └── accessibility-provider.tsx # 글자 크기·고대비 클라이언트 상태
```

## 접근성 (WCAG 2.1 AA + (주)엔씨투 강화 기준)

PRD §7.5 명시 요구사항 구현:

- **글자 크기 3단계** — 헤더 툴바에서 기본/크게/매우 크게 토글 (CSS 변수로 즉시 반영, localStorage 유지)
- **고대비 모드** — 헤더 툴바 토글, `data-theme="highcontrast"` 속성 기반
- **스킵 링크** — 키보드 사용자가 본문으로 바로 점프 (`#main`)
- **포커스 가시성** — `:focus-visible`로 황토색 outline 3px
- **`prefers-reduced-motion`** — 자동 애니메이션 비활성화
- **ARIA 라벨** — 네비게이션·툴바·이미지 대체 텍스트 전반 적용
- **시멘틱 HTML** — `<header>`, `<main>`, `<nav>`, `<footer>`, `<article>`, `<section>`

## AI 라벨 컴포넌트 (REQ-GOV-001)

모든 AI 보조 콘텐츠에는 `<AILabelBadge>` 컴포넌트로 라벨 자동 부착:

```tsx
import { AILabelBadge } from "@/components/ai-label-badge";

<AILabelBadge kind="ai_assisted" />   // 황토색 배지
<AILabelBadge kind="ai_generated" /> // 연황토 배지
<AILabelBadge kind="human" />         // 회색 배지
```

각 배지는 `title`·`aria-label`로 의미를 명확히 안내.

## 로컬 실행

```bash
cd web
npm install
npm run dev          # http://localhost:3000 (Next.js 개발 모드)
npm run typecheck
npm run lint
npm run build        # 표준 Next.js 빌드
```

## Cloudflare Pages 배포 (PRD v1.6 확정)

```bash
# 로컬에서 Cloudflare 어댑터 빌드 미리 검증
npm run build:cf

# Wrangler로 로컬 프리뷰 (Edge runtime 모사)
npm run preview:cf

# 수동 배포 (CI 미사용 시)
npx wrangler login
npm run deploy:cf
```

권장 운영 방식: **GitHub 연동 자동 배포**
1. Cloudflare 대시보드 → Pages → Create project → Connect to Git
2. 저장소: `Chung-haiseag/taeanInsight`, Root: `web/`
3. Framework: Next.js, Build command: `npx @cloudflare/next-on-pages@1`
4. Output: `.vercel/output/static`, Node: `20`
5. 환경변수는 Pages → Settings → Environment variables (Secret) 에 등록

자세한 DNS·SSL 절차: `docs/infrastructure/dns-setup-guide.md`

### Edge runtime 주의

Cloudflare Pages는 Edge runtime만 지원합니다. 동적 라우트·API 라우트에서는 상단에 다음 명시:

```ts
export const runtime = "edge";
```

순수 정적 페이지는 명시 불필요.

## 보안 헤더

`next.config.mjs`에 적용:
- `Strict-Transport-Security` (HSTS 2년 + preload)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera·mic·geolocation 차단)

## 향후 작업 (의존성 있는 후속 태스크)

| 태스크 | 의존 | 내용 |
|---|---|---|
| #21 OAuth2 SSO & Toss Payments | #20 | taeannews.co.kr SSO 통합 + 토스페이먼츠 결제 |
| #22 Weekly Insight Report Pipeline | #16, #20, #21 | 주간 리포트 발행 |
| #23 AI Query Agent UI | #15, #20 | 백엔드 Hybrid Router 연결 |
| #24 B2B Basic Dashboard | #11, #20, #21 | 데이터 시각화 + CSV 내보내기 |
| #25 Citizen Co-Pilot Web Editor | #16, #20 | TipTap 에디터 + AI 보조 5종 |

## 현재 상태 (2026-05-27)

- ✅ 코드베이스 부트스트랩 (구조·라우팅·기본 UI)
- ✅ 접근성 옵션 (글자 크기·고대비·스킵 링크)
- ✅ AI 라벨 컴포넌트
- ✅ 5개 페이지 자리표시 (홈·리포트·Query·대시보드·시민기자)
- ⏳ `npm install` 미실행 — 의존성 설치는 환경 준비 후
- ⏳ 백엔드 API 연결 — 후속 태스크
- ⏳ shadcn/ui 컴포넌트 도입 — 디자인 시스템 본격화 시
