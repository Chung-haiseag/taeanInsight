#!/bin/zsh
cd "$(dirname "$0")"
node digitize-ocr.mjs --dir /tmp/ebook_full
