#!/usr/bin/env bash
# 태안 크롤러를 기존 카페24/리눅스 VPS에 공존 설치(echotwin 등과 나란히).
#   태안 전용 `taean-` 네임스페이스 systemd 유닛 5개. 다른 프로젝트와 충돌 없음.
#   전제: 이 저장소를 VPS에 git clone 후 → sudo bash tools/vps/install.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE=/etc/taean.env

echo "▸ 저장소: $REPO"

echo "▸ 1) 필수 패키지(node18+, poppler-utils)"
if command -v apt-get >/dev/null; then
  apt-get update -y && apt-get install -y curl ca-certificates poppler-utils
  command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs; }
elif command -v dnf >/dev/null || command -v yum >/dev/null; then
  (command -v dnf >/dev/null && dnf install -y poppler-utils) || yum install -y poppler-utils
  command -v node >/dev/null || { curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && (dnf install -y nodejs || yum install -y nodejs); }
else
  echo "  ⚠ 패키지 매니저 미확인 — node 20+ 와 poppler-utils 수동 설치 후 재실행"; exit 1
fi
echo "  node $(node -v) · pdftotext $(command -v pdftotext || echo 없음)"
# 팟캐스트·기사낭독의 D1/R2 접근용 wrangler(헤드리스는 CLOUDFLARE_API_TOKEN 환경변수로 인증)
command -v wrangler >/dev/null || npm install -g wrangler
echo "  wrangler $(wrangler --version 2>/dev/null | head -1 || echo 없음)"

echo "▸ 2) 환경변수 → $ENV_FILE"
if [ ! -f "$ENV_FILE" ]; then
  cp "$REPO/tools/vps/taean.env.example" "$ENV_FILE"; chmod 600 "$ENV_FILE"
  echo "  ⚠ $ENV_FILE 값 채운 뒤 4)를 실행: sudo nano $ENV_FILE"
else echo "  이미 존재 — 유지"; fi

echo "▸ 3) systemd 유닛 설치(taean- 네임스페이스, WorkingDirectory=$REPO)"
for u in taean-gov taean-cctv taean-podcast taean-newsaudio taean-briefing; do
  sed "s#__REPO__#$REPO#g" "$REPO/tools/vps/$u.service" > "/etc/systemd/system/$u.service"
  cp "$REPO/tools/vps/$u.timer" "/etc/systemd/system/$u.timer"
done
systemctl daemon-reload

echo "▸ 4) 타이머 활성화"
systemctl enable --now taean-gov.timer taean-cctv.timer taean-podcast.timer taean-newsaudio.timer taean-briefing.timer
systemctl list-timers --no-pager | grep taean || true

cat <<MSG

✅ 완료(echotwin과 공존, taean- 네임스페이스)
  · 군청 6h · CCTV 30분 · 팟캐스트 금 18:00 · 기사낭독 매일 07:00
즉시 1회 실행/검증:
  sudo systemctl start taean-gov.service   && journalctl -u taean-gov.service   -n 20 --no-pager
  sudo systemctl start taean-cctv.service  && journalctl -u taean-cctv.service  -n 20 --no-pager
  sudo systemctl start taean-newsaudio.service && journalctl -u taean-newsaudio.service -n 30 --no-pager
제거: sudo systemctl disable --now taean-*.timer && rm /etc/systemd/system/taean-*
MSG
