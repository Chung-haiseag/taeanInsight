#!/usr/bin/env bash
# 군청 군정·카드뉴스 로컬 수집 러너 — launchd가 주기 실행(한국 IP 필요).
# 토큰: 환경변수 TAEAN_GOV_TOKEN 또는 tools/gov/.token 파일(깃 미추적).
set -euo pipefail

REPO="/Applications/taean"
cd "$REPO"

TOKEN="${TAEAN_GOV_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f "tools/gov/.token" ]; then
  TOKEN="$(tr -d '[:space:]' < tools/gov/.token)"
fi
if [ -z "$TOKEN" ]; then
  echo "$(date '+%F %T') TAEAN_GOV_TOKEN 없음 (tools/gov/.token 생성 필요)" >> tools/gov/ingest.log
  exit 1
fi
export TAEAN_GOV_TOKEN="$TOKEN"

# node 경로(launchd는 PATH가 제한적이라 절대경로 우선 탐색)
NODE="$(command -v node || echo /usr/local/bin/node)"
[ -x "$NODE" ] || NODE="/opt/homebrew/bin/node"

echo "$(date '+%F %T') 군청 수집 시작" >> tools/gov/ingest.log
"$NODE" tools/gov/ingest-gov.mjs --max=12 >> tools/gov/ingest.log 2>&1
echo "$(date '+%F %T') 군청 수집 종료" >> tools/gov/ingest.log
