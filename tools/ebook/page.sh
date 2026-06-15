#!/bin/zsh
# 지면 단위 디지털화 (Google Vision만, 클로드 미사용 · 비용 0)
#   사용: sh page.sh 1996                  → 한 연도
#         sh page.sh 1996 1997 1998 2000   → 여러 연도 순차
#         sh page.sh                       → 전체(처리된 면 스킵)
# 필요: GOOGLE_VISION_API_KEY (Cloud Vision). ANTHROPIC_API_KEY 불필요.
# 적재: 끝나면  node publish.mjs --skip-spacing   (클로드 호출 없음)
cd "$(dirname "$0")"
export OCR_ENGINE=google
export OCR_COLS=12
export PAGE_MODE=1
ROOT="/Users/nctoo/Downloads/1-지역신문/02-태안신문/과거신문"
if [ "$#" -eq 0 ]; then
  node digitize-ocr.mjs --dir "$ROOT"
else
  for y in "$@"; do
    echo ""
    echo "========== $y 시작 =========="
    node digitize-ocr.mjs --dir "$ROOT/$y"
    echo "========== $y 완료 =========="
  done
  echo ""
  echo "전체 완료 — 이제: node publish.mjs --skip-spacing"
fi
