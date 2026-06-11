#!/bin/zsh
cd "$(dirname "$0")"
export OCR_ENGINE=google
node digitize-ocr.mjs --dir /tmp/ebook_full
