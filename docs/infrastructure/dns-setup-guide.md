# `insight.taeannews.co.kr` DNS·HTTPS 설정 가이드

**대상**: `taeannews.co.kr` 도메인 관리자
**작성**: 2026-05-27
**관련**: PRD v1.5 §6 REQ-PLATFORM-001 · TaskMaster #8
**예상 소요**: 30분 (DNS 변경) + 10분~24시간 (전파 대기) + 5분 (인증서 발급)

---

## 한 줄 요약

`taeannews.co.kr` 의 서브도메인으로 `insight.taeannews.co.kr` 을 추가하여, AI 인사이트 서비스를 별도 운영합니다. 본 가이드의 절차를 따르면 **추가 비용 없이** SSL까지 완료됩니다.

---

## 왜 별도 서브도메인인가?

| 구분 | 기존 `taeannews.co.kr` | 신규 `insight.taeannews.co.kr` |
|---|---|---|
| 역할 | 무료 뉴스·커뮤니티 허브 | AI 예측·유료 서비스 |
| 운영 주체 | 엔디소프트 CMS | Next.js (별도 코드베이스) |
| 영향 | **변경 없음** (기존 그대로) | 신규 추가 |

기존 사이트는 그대로 유지되며 **다운타임 0**으로 진행 가능합니다.

---

## 배포 옵션 결정 (관리자 선택)

DNS 레코드는 어디에 호스팅할지에 따라 달라집니다. 한 옵션을 고른 뒤 § 3로 이동하세요.

### Option A. Vercel (권장)

- **장점**: Next.js 공식 호스팅, 무료 티어로 시작 가능, SSL 자동, 글로벌 CDN
- **비용**: 트래픽 100GB/월까지 무료, 초과 시 Pro $20/월
- **DNS 작업**: A 레코드 1개 또는 CNAME 1개
- **SSL**: Vercel이 자동 발급·갱신

### Option B. Cloudflare Pages

- **장점**: 무제한 무료 트래픽, Cloudflare CDN
- **비용**: 무료 (대용량까지)
- **DNS 작업**: CNAME 1개
- **SSL**: Cloudflare가 자동 발급·갱신

### Option C. NCloud / AWS / 자체 서버

- **장점**: 한국 데이터 보관, 공공기관 연계 용이
- **비용**: 월 5~10만원 (서버 + 트래픽)
- **DNS 작업**: A 레코드 (서버 공인 IP)
- **SSL**: Let's Encrypt + certbot 직접 설치 (§ 5 참고)

→ **권장**: 초기에는 **Vercel** 또는 **Cloudflare Pages**로 시작. 트래픽·규제 요구가 명확해지는 Phase 3 베타 시점에 NCloud 이전 재검토.

---

## DNS 레코드 설정 (Option A·B 공통)

`taeannews.co.kr` 도메인 등록기관(가비아·후이즈·카페24·아이네임즈 등)의 DNS 관리 화면에 접속합니다.

### Vercel을 선택한 경우

다음 두 레코드 중 **하나만** 추가:

**(권장) CNAME 방식**
```
Type:   CNAME
Name:   insight
Value:  cname.vercel-dns.com.
TTL:    3600
```

또는 **A 레코드 방식** (CNAME이 안 되는 일부 등록기관):
```
Type:   A
Name:   insight
Value:  76.76.21.21          (Vercel 공식 anycast IP)
TTL:    3600
```

### Cloudflare Pages를 선택한 경우

```
Type:   CNAME
Name:   insight
Value:  <project-name>.pages.dev.
TTL:    3600
Proxy:  Proxied (Cloudflare 사용 시)
```

### NCloud / AWS / 자체 서버를 선택한 경우

```
Type:   A
Name:   insight
Value:  <서버의 공인 IP 주소>
TTL:    3600
```

> **Name 필드 입력 주의**: 일부 한국 등록기관은 `insight` 만 입력하고, 일부는 `insight.taeannews.co.kr.` 전체를 입력합니다. 등록기관 UI 안내를 따라주세요.

---

## DNS 전파 확인

DNS 변경 후 보통 10분~1시간 (최대 24시간) 내에 전파됩니다. 다음 명령으로 확인:

```bash
# 도메인 조회 (어디서나 실행 가능)
dig insight.taeannews.co.kr +short
nslookup insight.taeannews.co.kr

# 또는 웹 도구 사용
# https://www.whatsmydns.net/#A/insight.taeannews.co.kr
```

정상 응답 예시 (Vercel):
```
76.76.21.21
```

> 본 저장소의 `docs/infrastructure/dns-verification.sh` 를 실행하면 자동 검증됩니다.

---

## HTTPS·SSL 인증서

### Vercel / Cloudflare Pages 사용 시

**작업 불필요.** Vercel·Cloudflare가 Let's Encrypt 기반 SSL을 **자동 발급·갱신**합니다. DNS 전파 완료 후 약 5분~1시간 내에 자동으로 HTTPS 적용됩니다.

### 자체 서버 사용 시

Let's Encrypt + certbot으로 무료 발급:

```bash
# 서버에 SSH 접속 후
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d insight.taeannews.co.kr

# 90일마다 자동 갱신
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### 인증서 검증

```bash
curl -I https://insight.taeannews.co.kr
# HTTP/2 200 또는 404가 나오면 SSL은 정상 (200 = 페이지 있음, 404 = SSL은 되나 콘텐츠 없음)

# 인증서 상세 확인
echo | openssl s_client -servername insight.taeannews.co.kr -connect insight.taeannews.co.kr:443 2>/dev/null | openssl x509 -noout -dates -issuer
```

---

## 보안 헤더 (이미 코드에 포함)

`web/next.config.mjs` 에 다음 헤더가 자동 적용됩니다:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

배포 후 https://securityheaders.com 에서 `insight.taeannews.co.kr` 조회하면 등급 확인 가능 (A 이상 목표).

---

## SSO 도메인 정책 (PRD §6 REQ-PLATFORM-003)

기존 `taeannews.co.kr` 과의 SSO를 위해 다음 정책을 향후 적용:

- 쿠키 도메인: `.taeannews.co.kr` (두 도메인에서 공유)
- CORS: `taeannews.co.kr` 출처 허용
- CSP: 두 도메인 상호 참조 허용

→ 본 DNS 단계에서는 **별도 작업 불필요**. 백엔드 인증 통합 시 (TaskMaster #21) 코드에서 처리.

---

## 단계별 체크리스트

도메인 관리자가 다음 순서로 진행:

- [ ] **사전 결정**: 배포 옵션 A/B/C 중 선택
- [ ] **DNS 레코드 추가**: `insight` 서브도메인 CNAME 또는 A
- [ ] **저장 후 10~60분 대기**
- [ ] **DNS 전파 확인**: `dig insight.taeannews.co.kr` 으로 정상 응답
- [ ] **(자체 서버만) SSL 발급**: certbot 실행
- [ ] **HTTPS 접속 확인**: `curl -I https://insight.taeannews.co.kr` 200/404 응답
- [ ] **보안 헤더 점검**: securityheaders.com 에서 A 등급 이상
- [ ] **본 가이드 마지막 § 검증 스크립트 실행**: `bash docs/infrastructure/dns-verification.sh`
- [ ] **개발팀에 완료 통보**: 이메일·슬랙으로 알림

---

## 트러블슈팅

### Q. CNAME이 안 잡혀요
→ Name 필드에 `insight.taeannews.co.kr.` 전체를 입력하거나, 등록기관 안내대로 `insight` 만 입력. 등록기관별로 다릅니다.

### Q. 24시간 지났는데도 전파 안 됨
→ `dig @8.8.8.8 insight.taeannews.co.kr` (구글 DNS로 강제 조회). 그래도 안 나오면 등록기관 고객센터 문의.

### Q. SSL 인증서 발급 실패 (자체 서버)
→ 80번 포트가 열려 있는지 확인. certbot은 도메인 소유 증명을 위해 80 포트로 챌린지 진행.

### Q. Vercel에서 "Domain not configured" 에러
→ Vercel 대시보드 → Project → Settings → Domains 에서 `insight.taeannews.co.kr` 을 직접 추가해야 함.

### Q. 보안 헤더 등급이 낮음
→ HSTS preload 등록(https://hstspreload.org)으로 A+ 가능. 단, 등록 후 되돌리기 어려우니 충분히 안정화된 후 신청.

---

## 도움 요청

- 본 가이드로 해결 안 되는 부분: 디지털전환 총괄 또는 (주)엔씨투에 문의
- DNS 등록기관 콜센터:
  - 가비아: 1599-3640
  - 후이즈: 1577-2607
  - 카페24: 1588-3284
