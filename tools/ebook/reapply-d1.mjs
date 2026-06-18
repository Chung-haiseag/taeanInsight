#!/usr/bin/env node
// 생성된 insert_*.sql 배치를 D1에 내결함성 재적용 (INSERT OR REPLACE라 멱등).
//   배치별 재시도(지수 백오프), 영구 실패는 기록하고 계속 진행.
// 사용: node reapply-d1.mjs
import { readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dir, "..", "backfill", "out", "d1");
const FAILLOG = join(__dir, "out", "reapply_failures.txt");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function d1file(path, tries = 5) {
  for (let t = 1; t <= tries; t++) {
    try {
      await exec("npx", ["wrangler", "d1", "execute", "taean-archive", "--remote", "--file", path, "--json"], { maxBuffer: 64 * 1024 * 1024 });
      return true;
    } catch (e) {
      const msg = String(e.stdout || e.stderr || e.message || "");
      const transient = /7500|InternalError|internal error|fetch failed|429|5\d\d|Network/i.test(msg);
      if (t < tries && transient) { await sleep(1500 * t * t); continue; }
      if (t < tries) { await sleep(1500 * t); continue; }
      return false;
    }
  }
  return false;
}

const files = (await readdir(SQL_DIR)).filter((f) => f.startsWith("insert_") && f.endsWith(".sql")).sort();
console.log(`재적용 대상: ${files.length}개 배치`);
const failed = [];
let done = 0;
for (const f of files) {
  const ok = await d1file(join(SQL_DIR, f));
  done++;
  if (!ok) { failed.push(f); process.stdout.write("X"); }
  else process.stdout.write(".");
  if (done % 50 === 0) process.stdout.write(` ${done}/${files.length}\n`);
}
console.log(`\n완료: ${done}개 · 실패 ${failed.length}개`);
if (failed.length) { await writeFile(FAILLOG, failed.join("\n") + "\n"); console.log("실패 목록:", FAILLOG); }
