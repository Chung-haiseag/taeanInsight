#!/usr/bin/env node
// 백필로 받은 사진(out/images/*) → Cloudflare R2 업로드 (영구보존 사본)
//
// 표시는 CDN URL 핫링크로 충분(공개). R2는 원본이 삭제될 때 대비한 백업이며,
// /api/archive/photo/<key> 로 서빙된다. key = photos/<파일명>
//
// 사용:
//   node upload-r2.mjs               # out/images/* 전부 업로드 (이미 올린 건 건너뜀)
//   node upload-r2.mjs --limit 50    # 테스트로 일부만
//
// ⚠️ 수만 장이면 wrangler 호출이 느립니다. 대량은 rclone(S3 호환) 권장:
//   rclone copy out/images r2:taean-archive-photos/photos
//
// Node 20+. wrangler CLI 필요.

import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const IMG_DIR = join(__dir, "out", "images");
const BUCKET = "taean-archive-photos";

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : def;
}

async function main() {
  if (!existsSync(IMG_DIR)) {
    console.error(`없음: ${IMG_DIR} — 먼저 --images-all 로 백필하세요`);
    process.exit(1);
  }
  let files = (await readdir(IMG_DIR)).filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f));
  const limit = Number(arg("--limit", "0"));
  if (limit > 0) files = files.slice(0, limit);

  console.log(`${files.length}개 업로드 시작 → r2://${BUCKET}/photos/`);
  let ok = 0,
    fail = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      await exec("npx", [
        "wrangler",
        "r2",
        "object",
        "put",
        `${BUCKET}/photos/${f}`,
        "--file",
        join(IMG_DIR, f),
        "--remote",
      ]);
      ok++;
    } catch (e) {
      fail++;
      if (fail <= 3) console.error(`\n실패 ${f}: ${e.message?.split("\n")[0]}`);
    }
    if ((i + 1) % 50 === 0 || i === files.length - 1) {
      process.stdout.write(`\r[${i + 1}/${files.length}] 성공 ${ok} · 실패 ${fail}   `);
    }
  }
  console.log(`\n완료: 업로드 ${ok} · 실패 ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
