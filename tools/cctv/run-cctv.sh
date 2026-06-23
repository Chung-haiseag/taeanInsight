#!/usr/bin/env bash
# 도로 CCTV 로컬 수집 러너 — launchd가 30분마다 실행(한국 IP 필요, ITS 9443 포트).
# 토큰: tools/gov/.token(= GOV_IMPORT_TOKEN) 재사용. ITS 키: tools/cctv/.its_key (둘 다 깃 미추적).
set -euo pipefail

REPO="/Applications/taean"
cd "$REPO"

TOKEN="${TAEAN_GOV_TOKEN:-}"
[ -z "$TOKEN" ] && [ -f "tools/gov/.token" ] && TOKEN="$(tr -d '[:space:]' < tools/gov/.token)"
KEY="${ITS_API_KEY:-}"
[ -z "$KEY" ] && [ -f "tools/cctv/.its_key" ] && KEY="$(tr -d '[:space:]' < tools/cctv/.its_key)"

if [ -z "$TOKEN" ] || [ -z "$KEY" ]; then
  echo "$(date '+%F %T') 토큰/ITS키 없음 (tools/gov/.token, tools/cctv/.its_key 필요)" >> tools/cctv/cctv.log
  exit 1
fi
export TAEAN_GOV_TOKEN="$TOKEN" ITS_API_KEY="$KEY"

NODE="$(command -v node || echo /usr/local/bin/node)"
[ -x "$NODE" ] || NODE="/opt/homebrew/bin/node"

echo "$(date '+%F %T') CCTV 수집 시작" >> tools/cctv/cctv.log
"$NODE" tools/cctv/refresh-cctv.mjs >> tools/cctv/cctv.log 2>&1
echo "$(date '+%F %T') CCTV 수집 종료" >> tools/cctv/cctv.log
