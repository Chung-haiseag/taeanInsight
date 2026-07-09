#!/bin/zsh
cd "$(dirname "$0")"
export OCR_ENGINE=clova
node digitize-gv.mjs --dir /tmp/ebook_c2 --limit 1
