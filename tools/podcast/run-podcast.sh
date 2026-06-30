#!/bin/bash
# 주간 팟캐스트 생성 래퍼(launchd/수동 공용). 키는 env 또는 tools/podcast/.gemini_key 에서.
cd /Applications/taean || exit 1
if [ -z "$GEMINI_API_KEY" ] && [ -f tools/podcast/.gemini_key ]; then
  export GEMINI_API_KEY="$(tr -d '\n' < tools/podcast/.gemini_key)"
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
echo "===== $(date '+%Y-%m-%d %H:%M:%S') 팟캐스트 생성 ====="
node tools/podcast/gen-podcast.mjs "$@"
