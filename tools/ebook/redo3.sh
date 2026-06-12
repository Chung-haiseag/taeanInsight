#!/bin/zsh
# 텍스트 품질 최종판 재실행 — 컬럼빈 12 + 줄바꿈공백 교정 프롬프트
# 순서(1999→1990→1996)로 돌려 기존 idxno 배치 유지
cd "$(dirname "$0")"
export OCR_ENGINE=google
export OCR_COLS=12
rm -f out/ebook_articles.jsonl out/ebook_needs_review.txt out/ebook_dropped_ads.txt
node digitize-ocr.mjs --dir /tmp/redo_a   # 19991224
node digitize-ocr.mjs --dir /tmp/redo_b   # 19900514
node digitize-ocr.mjs --dir /tmp/redo_c   # 19960715
echo "\n=== redo3 전체 완료 ==="
