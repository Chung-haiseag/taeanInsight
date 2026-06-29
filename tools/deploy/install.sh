#!/usr/bin/env bash
# 태안 크롤러를 한국-IP Linux VM(Oracle Cloud 서울 Always Free 등)에 설치.
# Ubuntu/Debian(apt) 기준. 루트 또는 sudo로 실행.
#   git clone 후:  sudo bash tools/deploy/install.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR=/opt/taean-crawler
ENV_FILE=/etc/taean-crawler.env

echo "▸ 1) 패키지 설치 (node, poppler-utils)"
if command -v apt-get >/dev/null; then
  apt-get update -y
  apt-get install -y curl ca-certificates poppler-utils
  if ! command -v node >/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
else
  echo "  ⚠ apt 아님 — node 20+ 와 poppler-utils 를 수동 설치 후 다시 실행하세요."; exit 1
fi
echo "  node: $(node -v) · pdftotext: $(command -v pdftotext || echo '없음')"

echo "▸ 2) 크롤러 배치 → $APP_DIR"
mkdir -p "$APP_DIR"
cp "$REPO_DIR/tools/gov/ingest-gov.mjs" "$APP_DIR/"
cp "$REPO_DIR/tools/cctv/refresh-cctv.mjs" "$APP_DIR/"

echo "▸ 3) 환경변수 파일 → $ENV_FILE"
if [ ! -f "$ENV_FILE" ]; then
  cp "$REPO_DIR/tools/deploy/taean-crawler.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "  ⚠ $ENV_FILE 에 TAEAN_GOV_TOKEN·ITS_API_KEY 값을 채운 뒤 4)를 실행하세요."
  echo "     sudo nano $ENV_FILE"
else
  echo "  이미 존재 — 유지"
fi

echo "▸ 4) systemd 타이머 설치·활성화"
cp "$REPO_DIR"/tools/deploy/taean-gov.service "$REPO_DIR"/tools/deploy/taean-gov.timer \
   "$REPO_DIR"/tools/deploy/taean-cctv.service "$REPO_DIR"/tools/deploy/taean-cctv.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now taean-gov.timer taean-cctv.timer
echo "  활성 타이머:"; systemctl list-timers --no-pager | grep taean || true

echo ""
echo "✅ 완료. 즉시 한 번 실행해 확인:"
echo "   sudo systemctl start taean-gov.service && journalctl -u taean-gov.service -n 30 --no-pager"
echo "   sudo systemctl start taean-cctv.service && journalctl -u taean-cctv.service -n 30 --no-pager"
