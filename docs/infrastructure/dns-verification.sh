#!/usr/bin/env bash
# DNS·HTTPS 검증 스크립트 — insight.taeannews.co.kr
# 사용법: bash docs/infrastructure/dns-verification.sh

set -u
DOMAIN="${1:-insight.taeannews.co.kr}"

# 색상 (터미널 지원 시)
if [ -t 1 ]; then
    GREEN="\033[0;32m"
    RED="\033[0;31m"
    YELLOW="\033[0;33m"
    BOLD="\033[1m"
    RESET="\033[0m"
else
    GREEN=""; RED=""; YELLOW=""; BOLD=""; RESET=""
fi

PASS=0
FAIL=0
WARN=0

pass()  { printf "  ${GREEN}✓${RESET} %s\n" "$1"; PASS=$((PASS+1)); }
fail()  { printf "  ${RED}✗${RESET} %s\n" "$1"; FAIL=$((FAIL+1)); }
warn()  { printf "  ${YELLOW}⚠${RESET} %s\n" "$1"; WARN=$((WARN+1)); }
section() { printf "\n${BOLD}▶ %s${RESET}\n" "$1"; }

printf "${BOLD}DNS·HTTPS 검증: %s${RESET}\n" "$DOMAIN"
printf "실행 시각: %s\n" "$(date '+%Y-%m-%d %H:%M:%S')"

# 1. DNS 레코드 조회 (A·CNAME 둘 다 시도)
section "1. DNS 레코드 조회"
A_RECORD=$(dig +short "$DOMAIN" A 2>/dev/null | head -n 1 || true)
CNAME_RECORD=$(dig +short "$DOMAIN" CNAME 2>/dev/null | head -n 1 || true)

if [ -n "$CNAME_RECORD" ]; then
    pass "CNAME → $CNAME_RECORD"
elif [ -n "$A_RECORD" ]; then
    pass "A 레코드 → $A_RECORD"
else
    fail "DNS 레코드 없음 — DNS 설정이 안 되었거나 전파 대기 중"
    printf "    힌트: dig @8.8.8.8 %s 로 구글 DNS 강제 조회 시도\n" "$DOMAIN"
fi

# 2. Google DNS로 교차 검증 (전파 일관성)
section "2. 글로벌 DNS 전파 일관성"
GOOGLE_A=$(dig @8.8.8.8 +short "$DOMAIN" A 2>/dev/null | head -n 1 || true)
GOOGLE_CNAME=$(dig @8.8.8.8 +short "$DOMAIN" CNAME 2>/dev/null | head -n 1 || true)
CF_A=$(dig @1.1.1.1 +short "$DOMAIN" A 2>/dev/null | head -n 1 || true)

if [ -n "$GOOGLE_A$GOOGLE_CNAME" ] && [ -n "$CF_A" ]; then
    pass "Google DNS·Cloudflare DNS 모두 응답"
elif [ -n "$GOOGLE_A$GOOGLE_CNAME" ]; then
    warn "Google DNS 응답 OK, Cloudflare DNS 미응답 — 전파 진행 중"
else
    fail "글로벌 DNS 전파 안 됨 — 추가 대기 필요"
fi

# 3. HTTPS 접속
section "3. HTTPS 접속"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://$DOMAIN" 2>/dev/null || echo "000")
case "$HTTP_STATUS" in
    200|301|302|307|308)
        pass "HTTPS 200/3xx 응답 (실제 코드: $HTTP_STATUS)"
        ;;
    404)
        warn "HTTPS 연결 OK이나 404 — SSL은 정상, 콘텐츠 미배포 (Vercel 등 배포 대기 중일 수 있음)"
        ;;
    000)
        fail "HTTPS 연결 실패 — DNS 미설정·SSL 미발급·서버 미가동 중 하나"
        ;;
    *)
        warn "HTTPS 응답 코드: $HTTP_STATUS (확인 필요)"
        ;;
esac

# 4. SSL 인증서 유효성·발급자
section "4. SSL 인증서"
CERT_INFO=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" -verify_return_error 2>/dev/null | openssl x509 -noout -dates -issuer 2>/dev/null || true)
if [ -n "$CERT_INFO" ]; then
    pass "인증서 발급 확인"
    echo "$CERT_INFO" | sed 's/^/    /'
else
    fail "인증서 검증 실패 — 포트 443 미개방 또는 인증서 미설정"
fi

# 5. HTTP → HTTPS 리다이렉트
section "5. HTTP → HTTPS 리다이렉트"
REDIRECT=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 5 "http://$DOMAIN" 2>/dev/null || echo "")
if [[ "$REDIRECT" == https://* ]]; then
    pass "HTTP → HTTPS 자동 리다이렉트: $REDIRECT"
else
    warn "HTTP 리다이렉트 없음 — 평문 접근 차단 권장 (대부분 호스팅은 자동 처리)"
fi

# 6. 보안 헤더 (배포 후)
section "6. 보안 헤더"
HEADERS=$(curl -sI --max-time 10 "https://$DOMAIN" 2>/dev/null || true)
if [ -n "$HEADERS" ]; then
    if echo "$HEADERS" | grep -qi "strict-transport-security"; then
        pass "HSTS 헤더 있음"
    else
        warn "HSTS 헤더 없음 — next.config.mjs 적용 후 배포 확인"
    fi
    if echo "$HEADERS" | grep -qi "x-content-type-options"; then
        pass "X-Content-Type-Options 헤더 있음"
    else
        warn "X-Content-Type-Options 헤더 없음"
    fi
    if echo "$HEADERS" | grep -qi "referrer-policy"; then
        pass "Referrer-Policy 헤더 있음"
    else
        warn "Referrer-Policy 헤더 없음"
    fi
else
    warn "헤더 조회 실패 — HTTPS 연결이 안 됨"
fi

# 결과 요약
section "결과 요약"
printf "  통과: ${GREEN}%d${RESET}  경고: ${YELLOW}%d${RESET}  실패: ${RED}%d${RESET}\n" "$PASS" "$WARN" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
    printf "\n${RED}${BOLD}❌ 실패 항목이 있습니다.${RESET} 위 메시지를 확인하세요.\n"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    printf "\n${YELLOW}${BOLD}⚠️  경고 항목이 있으나 진행 가능합니다.${RESET}\n"
    exit 0
else
    printf "\n${GREEN}${BOLD}✅ 모든 검증 통과.${RESET}\n"
    exit 0
fi
