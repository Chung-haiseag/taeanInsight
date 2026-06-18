#!/bin/zsh
# 1990 세로쓰기 지면 → Gemini 멀티모달 디지털화 (page.sh와 같은 사용감).
#   sh gv1990.sh sample → 내용면 2장 샘플(19900521, 상위모델 flash로 품질확인)
#   sh gv1990.sh test   → 1면만(--limit 1)
#   sh gv1990.sh        → 전체(이미 한 면은 자동 스킵, 이어하기)
# 키: 현재 셸의 GEMINI_API_KEY 사용. 없으면 .env.local 에서 로드.
cd "$(dirname "$0")"
if [ -z "$GEMINI_API_KEY" ] && [ -f .env.local ]; then
  set -a; . ./.env.local; set +a
fi
if [ -z "$GEMINI_API_KEY" ]; then
  echo "GEMINI_API_KEY 없음 — 터미널에서  export GEMINI_API_KEY=...  먼저 하거나 .env.local 작성"
  exit 1
fi
export GEMINI_MODEL="${GEMINI_MODEL_OVERRIDE:-gemini-2.5-flash}"   # 세로쓰기 품질 위해 상위모델 고정
DIR="/Applications/taean/tools/ebook/src1990"   # → 과거신문/1990 심볼릭 링크(한글 경로 회피)
case "$1" in
  savekey) printf 'GEMINI_API_KEY=%s\n' "$GEMINI_API_KEY" > .env.local; echo "키 저장 완료($(wc -c < .env.local)바이트) — 이제 클로드가 진행합니다"; exit 0 ;;
  sample) node digitize-gemini-vision.mjs --dir "$DIR" --date 19900521 --limit 2 ;;
  test)   node digitize-gemini-vision.mjs --dir "$DIR" --limit 1 ;;
  *)      node digitize-gemini-vision.mjs --dir "$DIR" "$@"
          echo ""; echo "전체 완료 — 적재는 내가(클로드) 할게요: node publish.mjs --skip-spacing" ;;
esac
