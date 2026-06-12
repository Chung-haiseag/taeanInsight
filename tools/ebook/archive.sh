#!/bin/zsh
cd "$(dirname "$0")"
export OCR_ENGINE=google
node digitize-ocr.mjs --dir "/Users/nctoo/Downloads/예전홈피_자료"
