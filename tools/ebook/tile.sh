#!/bin/zsh
cd "$(dirname "$0")"
node digitize-tile.mjs --dir /tmp/ebook_c2 --limit 1
