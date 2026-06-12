#!/usr/bin/env node
// 원본 지면 이미지를 R2에 업로드 — 관리자 검수 화면의 "원본 지면 보기"용
// 키: ebook/<YYYYMMDD>/page_<NN>.jpg (1600px, q80 — 대조용으로 충분·가벼움)
// 사용: node upload-pages.mjs --dir "/Users/nctoo/Downloads/예전홈피_자료"

import { readdir, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dir, "out", "pages");
const R2_BUCKET = "taean-archive-photos";

function arg(n) { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : null; }
async function sh(c, a) { return exec(c, a, { maxBuffer: 96 * 1024 * 1024 }); }

const dir = arg("--dir");
if (!dir) { console.error("--dir 필요"); process.exit(1); }
await mkdir(TMP, { recursive: true });

const dates = (await readdir(dir)).filter((d) => /^\d{8}$/.test(d)).sort();
let n = 0;
for (const date of dates) {
  const files = (await readdir(join(dir, date))).filter((f) => /^TA_\d{8}_\d+\.pdf$/i.test(f)).sort();
  for (const f of files) {
    const page = (f.match(/_(\d+)\.pdf$/i) || [])[1];
    const out = join(TMP, `${date}_${page}`);
    await sh("pdftoppm", ["-jpeg", "-jpegopt", "quality=80", "-r", "150", "-singlefile", "-scale-to", "1600", join(dir, date, f), out]);
    await sh("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/ebook/${date}/page_${page}.jpg`, "--file", `${out}.jpg`, "--content-type", "image/jpeg", "--remote"]);
    // 고해상 변형(확대 보기용) — 가로폭 1800px 고정
    await sh("pdftoppm", ["-jpeg", "-jpegopt", "quality=82", "-r", "300", "-singlefile", "-scale-to-x", "1800", "-scale-to-y", "-1", join(dir, date, f), `${out}_full`]);
    await sh("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/ebook/${date}/page_${page}full.jpg`, "--file", `${out}_full.jpg`, "--content-type", "image/jpeg", "--remote"]);
    n++;
    process.stdout.write(`\r업로드 ${n}: ${date}/page_${page}.jpg   `);
  }
}
console.log(`\n완료: 지면 ${n}장`);
