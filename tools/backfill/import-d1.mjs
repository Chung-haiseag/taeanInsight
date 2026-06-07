#!/usr/bin/env node
// 백필 결과(out/articles.jsonl) → Cloudflare D1 적재용 SQL 배치 생성
//
// 사용:
//   node import-d1.mjs                 # out/d1/insert_000.sql ... 생성
//   node import-d1.mjs --batch 500     # 배치 크기 조정
//
// 적용(생성 후):
//   wrangler d1 execute taean-archive --remote --file=db/migrations/006_archive_articles.sql
//   for f in tools/backfill/out/d1/insert_*.sql; do wrangler d1 execute taean-archive --remote --file=$f; done
//
// Node 20+, 의존성 없음.

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const JSONL = join(__dir, "out", "articles.jsonl");
const SQL_DIR = join(__dir, "out", "d1");

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : def;
}

const BATCH = Number(arg("--batch", "500"));

// SQL 문자열 이스케이프 — 작은따옴표만 이중화, NUL 제거 (공백·줄바꿈은 보존)
function q(v) {
  if (v == null) return "NULL";
  return "'" + String(v).replace(/\0/g, "").replace(/'/g, "''") + "'";
}
function num(v) {
  if (v == null || v === "") return "NULL";
  return Number(v) || "NULL";
}

async function main() {
  if (!existsSync(JSONL)) {
    console.error(`없음: ${JSONL} — 먼저 백필을 돌리세요 (node backfill.mjs ...)`);
    process.exit(1);
  }
  await mkdir(SQL_DIR, { recursive: true });
  for (const f of await readdir(SQL_DIR).catch(() => [])) {
    if (f.startsWith("insert_")) await rm(join(SQL_DIR, f));
  }

  const lines = (await readFile(JSONL, "utf8")).split("\n").filter((l) => l.trim());
  let fileIdx = 0;
  let rows = [];
  let total = 0;

  async function flush() {
    if (!rows.length) return;
    const sql =
      "INSERT OR REPLACE INTO archive_articles\n" +
      "(idxno,title,published_at,year,section,category,author,excerpt,body,images,lead_image,members_only,url) VALUES\n" +
      rows.join(",\n") +
      ";\n";
    const name = `insert_${String(fileIdx).padStart(3, "0")}.sql`;
    await writeFile(join(SQL_DIR, name), sql);
    fileIdx++;
    rows = [];
  }

  for (const line of lines) {
    let a;
    try {
      a = JSON.parse(line);
    } catch {
      continue;
    }
    rows.push(
      "(" +
        [
          num(a.idxno),
          q(a.title),
          q(a.publishedAt),
          num(a.year),
          q(a.section),
          q(a.category),
          q(a.author),
          q(a.excerpt),
          q(a.body),
          q(JSON.stringify(a.images || [])),
          q(a.leadImage),
          a.membersOnly ? 1 : 0,
          q(a.url),
        ].join(",") +
        ")",
    );
    total++;
    if (rows.length >= BATCH) await flush();
  }
  await flush();

  console.log(`생성 완료: ${total}건 → ${fileIdx}개 배치 (${SQL_DIR})`);
  console.log("\n적용:");
  console.log("  wrangler d1 execute taean-archive --remote --file=db/migrations/006_archive_articles.sql");
  console.log("  for f in tools/backfill/out/d1/insert_*.sql; do wrangler d1 execute taean-archive --remote --file=$f; done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
