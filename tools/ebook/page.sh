#!/bin/zsh
# 지면 단위 디지털화 (Google Vision만, 클로드 미사용 · 비용 0)
#   사용: sh page.sh 1990        → 해당 연도만
#         sh page.sh             → 전체(처리된 면 스킵)
# 필요: GOOGLE_VISION_API_KEY (Cloud Vision). ANTHROPIC_API_KEY 불필요.
# 적재: 끝나면  node publish.mjs --skip-spacing   (클로드 호출 없음)
cd "$(dirname "$0")"
export OCR_ENGINE=google
export OCR_COLS=12
export PAGE_MODE=1
BASE="/Users/nctoo/Downloads/1-지역신문/02-태안신문/과거신문"
if [ -n "$1" ]; then BASE="$BASE/$1"; fi
node digitize-ocr.mjs --dir "$BASE"
