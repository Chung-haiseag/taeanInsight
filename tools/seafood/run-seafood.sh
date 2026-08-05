#!/usr/bin/env bash
# KAMIS 어패류 소매 시세 로컬 수집 러너 — launchd가 하루 1회 실행(한국IP, KAMIS는 Worker가 못 닿음).
#   토큰: tools/gov/.token(= GOV_IMPORT_TOKEN) 재사용. KAMIS 키: tools/seafood/.kamis_key(1줄=키, 2줄=가입ID 선택). 둘 다 깃 미추적.
set -euo pipefail

REPO="/Applications/taean"
cd "$REPO"

TOKEN="${TAEAN_GOV_TOKEN:-}"
[ -z "$TOKEN" ] && [ -f "tools/gov/.token" ] && TOKEN="$(tr -d '[:space:]' < tools/gov/.token)"

CERT_KEY="${KAMIS_CERT_KEY:-}"
CERT_ID="${KAMIS_CERT_ID:-}"
if [ -z "$CERT_KEY" ] && [ -f "tools/seafood/.kamis_key" ]; then
  CERT_KEY="$(sed -n '1p' tools/seafood/.kamis_key | tr -d '[:space:]')"
  CERT_ID="$(sed -n '2p' tools/seafood/.kamis_key | tr -d '[:space:]')"
fi

if [ -z "$TOKEN" ] || [ -z "$CERT_KEY" ]; then
  echo "$(date '+%F %T') 토큰/키 없음 (tools/gov/.token, tools/seafood/.kamis_key 필요)" >> tools/seafood/seafood.log
  exit 1
fi
export TAEAN_GOV_TOKEN="$TOKEN" KAMIS_CERT_KEY="$CERT_KEY" KAMIS_CERT_ID="$CERT_ID"

NODE="$(command -v node || echo /usr/local/bin/node)"
[ -x "$NODE" ] || NODE="/opt/homebrew/bin/node"
"$NODE" tools/seafood/refresh-seafood.mjs >> tools/seafood/seafood.log 2>&1
