#!/bin/bash
# 매일 아침 낭독 생성(무료 키 로테이션). launchd(07:00)/수동 공용.
cd /Applications/taean || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# ① 오늘의 브리핑 낭독 — 1면에서 독자가 바로 보는 것이라 **먼저** 만든다.
#    호출 한 번(20초 분량)이면 끝나는데, 기사 낭독이 먼저 돌면 키를 다 써 버려
#    정작 1면 '브리핑 듣기'가 비는 수가 있다. 실패해도 기사 낭독은 계속한다.
echo "===== $(date '+%Y-%m-%d %H:%M:%S') 오늘의 브리핑 낭독 ====="
node tools/news-audio/gen-brief-audio.mjs \
  || echo "!! 브리핑 낭독 실패 — 오늘 '브리핑 듣기'는 '준비 중'으로 뜬다(/api/audio/status 의 brief 로 확인)"

# ② 주요 기사 낭독
echo "===== $(date '+%Y-%m-%d %H:%M:%S') 기사 낭독 생성 ====="
node tools/news-audio/gen-news-audio.mjs "$@"
