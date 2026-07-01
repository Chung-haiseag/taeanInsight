#!/bin/bash
# 오디오 자동 생성 launchd 설치(한 번만) — 팟캐스트(주간)+기사낭독(매일).
#   전제: tools/podcast/.gemini_key, tools/news-audio/.gemini_keys 준비됨.
set -e
LA="$HOME/Library/LaunchAgents"
mkdir -p "$LA"
UID_="$(id -u)"

install_job() {
  local label="$1" src="$2"
  cp "$src" "$LA/$label.plist"
  launchctl bootout "gui/$UID_/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_" "$LA/$label.plist"
  launchctl enable "gui/$UID_/$label"
  echo "  ✅ $label"
}

echo "▸ launchd 잡 설치"
install_job com.taean.podcast   /Applications/taean/tools/podcast/com.taean.podcast.plist
install_job com.taean.newsaudio /Applications/taean/tools/news-audio/com.taean.newsaudio.plist

echo "▸ 등록된 잡:"
launchctl list | grep -i taean || true

cat <<'MSG'

✅ 설치 완료
  · 팟캐스트   : 매주 금 18:00 KST
  · 기사 낭독  : 매일 07:00 KST (최신 30건, 이미있음 스킵)

즉시 한 번 실행해 검증:
  launchctl kickstart -k gui/$(id -u)/com.taean.newsaudio
  tail -f /Applications/taean/tools/news-audio/news-audio.log

현황 확인(어디서든):
  curl https://taean-insight-api.chs9182.workers.dev/api/audio/status
제거:
  launchctl bootout gui/$(id -u)/com.taean.podcast
  launchctl bootout gui/$(id -u)/com.taean.newsaudio
MSG
