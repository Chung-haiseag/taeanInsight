#!/usr/bin/env bash
# 충남 교통량 로컬 수집 러너 — launchd가 주기 실행(한국IP, data.ex.co.kr는 Worker가 못 닿음).
#   토큰: tools/gov/.token(= GOV_IMPORT_TOKEN) 재사용. 도로공사 키: tools/traffic/.ex_key (둘 다 깃 미추적).
set -euo pipefail

REPO="/Applications/taean"
cd "$REPO"

TOKEN="${TAEAN_GOV_TOKEN:-}"
[ -z "$TOKEN" ] && [ -f "tools/gov/.token" ] && TOKEN="$(tr -d '[:space:]' < tools/gov/.token)"
KEY="${EX_API_KEY:-}"
[ -z "$KEY" ] && [ -f "tools/traffic/.ex_key" ] && KEY="$(tr -d '[:space:]' < tools/traffic/.ex_key)"

if [ -z "$TOKEN" ] || [ -z "$KEY" ]; then
  echo "$(date '+%F %T') 토큰/키 없음 (tools/gov/.token, tools/traffic/.ex_key 필요)" >> tools/traffic/traffic.log
  exit 1
fi
export TAEAN_GOV_TOKEN="$TOKEN" EX_API_KEY="$KEY"

NODE="$(command -v node || echo /usr/local/bin/node)"
[ -x "$NODE" ] || NODE="/opt/homebrew/bin/node"
"$NODE" tools/traffic/refresh-traffic.mjs >> tools/traffic/traffic.log 2>&1
