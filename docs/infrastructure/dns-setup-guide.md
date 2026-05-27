# `insight.taeannews.co.kr` DNS·HTTPS 설정 가이드

**대상**: `taeannews.co.kr` 도메인 관리자
**작성**: 2026-05-27 (v1.6 Cloudflare Pages 확정)
**관련**: PRD v1.6 §6 REQ-PLATFORM-001 · TaskMaster #8
**예상 소요**: 30분 (DNS 변경) + 10분~24시간 (전파 대기) + 5분 (인증서 발급)

---

## 한 줄 요약

`taeannews.co.kr` 의 서브도메인으로 `insight.taeannews.co.kr` 을 추가하여, **Cloudflare Pages** 에 배포된 AI 인사이트 서비스로 연결합니다. SSL은 Cloudflare가 자동 발급·갱신하며, **추가 비용 없습니다**.

---

## 왜 별도 서브도메인인가?

| 구분 | 기존 `taeannews.co.kr` | 신규 `insight.taeannews.co.kr` |
|---|---|---|
| 역할 | 무료 뉴스·커뮤니티 허브 | AI 예측·유료 서비스 |
| 운영 주체 | 엔디소프트 CMS | Next.js (별도 코드베이스) |
| 호스팅 | (기존 그대로) | **Cloudflare Pages** |
| 영향 | **변경 없음** (다운타임 0) | 신규 추가 |

---

## 왜 Cloudflare Pages인가? (PRD v1.6 결정 근거)

- **무제한 무료 트래픽** — 사업 운영비 월 30만원 목표 정합성 최상
- **자동 SSL** — Let's Encrypt 기반 자동 발급·갱신
- **글로벌 CDN** — Cloudflare 전 세계 엣지에서 캐싱
- **Workers·R2 연계** — 향후 백엔드·스토리지 확장 용이
- **DDoS 보호** — 기본 제공

대안 (필요 시):
- **NCloud / 자체 서버** — 한국 데이터 보관·공공기관 연계 시. 월 5~10만원

---

## DNS 레코드 설정

`taeannews.co.kr` 도메인 등록기관(가비아·후이즈·카페24·아이네임즈 등)의 DNS 관리 화면에서 다음 레코드 1개를 추가합니다.

```
Type:   CNAME
Name:   insight
Value:  taean-insight.pages.dev.
TTL:    3600  (또는 자동)
```

> `taean-insight.pages.dev` 는 Cloudflare Pages 프로젝트 생성 시 부여되는 기본 도메인입니다. 정확한 값은 Cloudflare Pages 대시보드에서 확인 후 알려드리겠습니다.

> **Name 필드 입력 주의**: 일부 한국 등록기관은 `insight` 만 입력하고, 일부는 `insight.taeannews.co.kr.` 전체를 입력합니다. 등록기관 UI 안내를 따라주세요.

---

## Cloudflare Pages 측 작업 (개발팀이 수행)

1. Cloudflare 계정 생성 (https://dash.cloudflare.com — 무료)
2. Pages → Create a project → Connect to Git (GitHub: `Chung-haiseag/taeanInsight`)
3. 빌드 설정:
   - Framework preset: `Next.js`
   - Build command: `npx @cloudflare/next-on-pages@1`
   - Build output directory: `.vercel/output/static`
   - Root directory: `web/`
   - Node version: `20`
4. 환경변수: (이후 백엔드 연동 시 추가)
5. 첫 빌드·배포 후 자동 부여되는 `<project>.pages.dev` 도메인 확인
6. Custom domains → `insight.taeannews.co.kr` 추가
7. Cloudflare가 자동으로 SSL 발급 (Universal SSL)

---

## DNS 전파 확인

DNS 변경 후 보통 10분~1시간 (최대 24시간) 내에 전파됩니다.

```bash
# 도메인 조회
dig insight.taeannews.co.kr +short
nslookup insight.taeannews.co.kr

# 웹 도구
# https://www.whatsmydns.net/#CNAME/insight.taeannews.co.kr
```

정상 응답 예시:
```
taean-insight.pages.dev.
104.21.x.x   (Cloudflare anycast)
172.67.x.x   (Cloudflare anycast)
```

본 저장소의 `docs/infrastructure/dns-verification.sh` 를 실행하면 자동 검증됩니다.

---

## HTTPS·SSL 인증서

**작업 불필요.** Cloudflare가 자동 발급·갱신합니다.

- DNS 전파 완료 후 약 5~15분 내 SSL 자동 활성화
- Universal SSL (무료) 기본 적용
- 90일마다 자동 갱신

확인:
```bash
curl -I https://insight.taeannews.co.kr
# HTTP/2 200 또는 404가 나오면 SSL은 정상

# 인증서 상세
echo | openssl s_client -servername insight.taeannews.co.kr \
  -connect insight.taeannews.co.kr:443 2>/dev/null \
  | openssl x509 -noout -dates -issuer
```

---

## 보안 헤더 (이미 코드에 포함)

`web/next.config.mjs` 에 다음 헤더가 자동 적용됩니다:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

배포 후 https://securityheaders.com 에서 `insight.taeannews.co.kr` 조회 → A 등급 이상 목표.

---

## Cloudflare 추가 권장 설정 (Pages 대시보드)

- **SSL/TLS mode**: `Full (strict)` — Pages는 기본 만족
- **Always Use HTTPS**: ON
- **Automatic HTTPS Rewrites**: ON
- **Brotli 압축**: ON
- **HTTP/3 (QUIC)**: ON
- **Email obfuscation**: 필요 시

---

## SSO 도메인 정책 (PRD §6 REQ-PLATFORM-003)

기존 `taeannews.co.kr` 과의 SSO를 위해 향후 적용:

- 쿠키 도메인: `.taeannews.co.kr` (두 도메인에서 공유)
- CORS: `taeannews.co.kr` 출처 허용
- CSP: 두 도메인 상호 참조 허용

→ DNS 단계에서는 **별도 작업 불필요**. 백엔드 인증 통합 시 (TaskMaster #21) 코드에서 처리.

---

## 단계별 체크리스트

- [ ] **개발팀**: Cloudflare 계정 생성 + Pages 프로젝트 연결
- [ ] **개발팀**: 첫 빌드 성공 + `.pages.dev` 도메인 확인 후 도메인 관리자에게 통보
- [ ] **도메인 관리자**: 위 CNAME 레코드 추가
- [ ] **저장 후 10~60분 대기**
- [ ] **DNS 전파 확인**: `dig insight.taeannews.co.kr +short` 정상 응답
- [ ] **개발팀**: Cloudflare Pages Custom domain 추가
- [ ] **SSL 자동 발급 대기 (~15분)**
- [ ] **HTTPS 접속 확인**: `curl -I https://insight.taeannews.co.kr`
- [ ] **보안 헤더 점검**: securityheaders.com 에서 A 등급 이상
- [ ] **자동 검증 실행**: `bash docs/infrastructure/dns-verification.sh`
- [ ] **완료 통보**: 디지털전환 총괄에게 알림

---

## 트러블슈팅

### Q. CNAME이 안 잡혀요
→ Name 필드에 `insight.taeannews.co.kr.` 전체를 입력하거나, 등록기관 안내대로 `insight` 만 입력. 등록기관별로 다릅니다.

### Q. 24시간 지났는데도 전파 안 됨
→ `dig @8.8.8.8 insight.taeannews.co.kr` (구글 DNS로 강제 조회). 그래도 안 나오면 등록기관 고객센터 문의.

### Q. Cloudflare에서 "Custom domain pending" 상태가 오래 유지됨
→ Cloudflare는 도메인 소유 증명을 위해 DNS 응답을 확인. DNS 전파가 완전히 끝난 후 Pages 대시보드에서 `Retry` 버튼.

### Q. SSL이 활성화 안 됨 ("SSL Pending")
→ DNS 전파 후 최대 15분 대기. 그래도 안 되면 Pages → Custom domains → 도메인 삭제 후 재등록.

### Q. Edge Functions·서버 컴포넌트 동작 안 함
→ Cloudflare Pages는 Edge runtime만 지원. Next.js `route.ts`·`page.tsx` 상단에 `export const runtime = "edge"` 추가 또는 정적 export.

### Q. 보안 헤더 등급이 낮음
→ HSTS preload 등록(https://hstspreload.org)으로 A+ 가능. 단, 등록 후 되돌리기 어려우니 충분히 안정화된 후 신청.

---

## 도움 요청

- 본 가이드로 해결 안 되는 부분: 디지털전환 총괄 또는 (주)엔씨투에 문의
- DNS 등록기관 콜센터:
  - 가비아: 1599-3640
  - 후이즈: 1577-2607
  - 카페24: 1588-3284
- Cloudflare 지원: https://dash.cloudflare.com → 우측 하단 채팅
