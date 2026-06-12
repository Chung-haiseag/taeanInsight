#!/bin/zsh
# 사용: sh archive.sh           → 전체(모든 연도, 처리된 호 스킵)
#       sh archive.sh 1994      → 해당 연도만
cd "$(dirname "$0")"
export OCR_ENGINE=google
export OCR_COLS=12
BASE="/Users/nctoo/Downloads/1-지역신문/02-태안신문/과거신문"
if [ -n "$1" ]; then BASE="$BASE/$1"; fi
node digitize-ocr.mjs --dir "$BASE"
