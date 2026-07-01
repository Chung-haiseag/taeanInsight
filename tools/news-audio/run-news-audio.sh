#!/bin/bash
# 주요 기사 Gemini 낭독 생성(무료 키 로테이션). launchd/수동 공용.
cd /Applications/taean || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
echo "===== $(date '+%Y-%m-%d %H:%M:%S') 기사 낭독 생성 ====="
node tools/news-audio/gen-news-audio.mjs "$@"
