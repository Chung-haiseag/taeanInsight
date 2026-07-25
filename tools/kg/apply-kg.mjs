#!/usr/bin/env node
// tools/kg/apply-kg.mjs — out/kg_mentions.jsonl(Task 3 산출물) → D1 적재.
//   kg_nodes(type=person, verified=0) + kg_mentions 배치 INSERT SQL 생성 후 wrangler로 원격 적용.
//   INSERT OR IGNORE라 멱등 — 재실행·중복 JSONL 줄 모두 안전 흡수(별도 dedup 불필요).
// 사용: node apply-kg.mjs [--dry]   (--dry: SQL만 생성, 원격 적용 생략)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { personNodeId } from "./lib.mjs";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "out");
const JSONL = join(OUT_DIR, "kg_mentions.jsonl");
const SQL_DIR = join(OUT_DIR, "d1");
const FAILLOG = join(OUT_DIR, "apply_failures.txt");

const DRY = process.argv.includes("--dry");
const BATCH_ROWS = 500; // 배치당 대략 이 정도 SQL 문 수(노드+mentions 혼합)
const NOW = new Date().toISOString(); // 이번 실행의 단일 타임스탬프(created_at/updated_at)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// D1 배치 적용 재시도 헬퍼 — tools/ebook/reapply-d1.mjs의 d1file()과 동일 패턴(동일 transient 판정).
async function d1file(path, tries = 5) {
  for (let t = 1; t <= tries; t++) {
    try {
      await exec(
        "npx",
        ["wrangler", "d1", "execute", "taean-archive", "--remote", "--file", path, "--json"],
        { maxBuffer: 64 * 1024 * 1024 }
      );
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

// SQL escaping — 이름은 lib.mjs normalizeName으로 이미 정규화(문자/숫자/공백만)되어 작은따옴표가
// 나올 수 없지만, 방어적으로 처리한다.
function sqlEscape(s) { return String(s).replace(/'/g, "''"); }

// verified는 항상 0(자동추출/미검증) — AI 질의 경로는 verified=1만 주입하므로 이 데이터는
// 답변에 절대 섞이지 않는다. 이 값을 1로 바꾸지 말 것.
function nodeInsertSQL(id, name) {
  return `INSERT OR IGNORE INTO kg_nodes(id,type,name,attrs_json,aliases,source,verified,schema_ver,created_at,updated_at) VALUES ('${sqlEscape(id)}','person','${sqlEscape(name)}',NULL,NULL,'아카이브 추출',0,1,'${NOW}','${NOW}');`;
}
function mentionInsertSQL(id, idxno) {
  return `INSERT OR IGNORE INTO kg_mentions(node_id,article_idxno,schema_ver,created_at) VALUES ('${sqlEscape(id)}',${idxno},1,'${NOW}');`;
}

async function main() {
  await mkdir(SQL_DIR, { recursive: true });

  let text;
  try {
    text = await readFile(JSONL, "utf8");
  } catch (e) {
    console.error(`입력 파일 없음(먼저 extract-persons.mjs 실행 필요): ${JSONL}`, e?.message || e);
    process.exit(1);
  }

  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  console.log(`${lines.length}줄 읽음: ${JSONL}`);

  // 배치 SQL 생성
  const files = [];
  let rows = [];
  let batchIdx = 0;
  let nodeRows = 0, mentionRows = 0, skippedLines = 0, skippedNames = 0;

  async function flush() {
    if (!rows.length) return;
    const fname = `kg_insert_${String(batchIdx).padStart(3, "0")}.sql`;
    const fpath = join(SQL_DIR, fname);
    await writeFile(fpath, rows.join("\n") + "\n");
    files.push(fpath);
    batchIdx++;
    rows = [];
  }

  for (const line of lines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (e) {
      skippedLines++;
      console.error("JSONL 파싱 실패(줄 스킵):", e?.message || e);
      continue;
    }
    const idxno = Number(rec?.idxno);
    const names = Array.isArray(rec?.names) ? rec.names : [];
    if (!Number.isFinite(idxno)) {
      skippedLines++;
      console.error("idxno 유효하지 않음(줄 스킵):", rec?.idxno);
      continue;
    }
    for (const raw of names) {
      if (typeof raw !== "string") continue; // 오염된 names 항목(person:null류 정크 노드 방지)
      const id = personNodeId(raw); // lib.mjs 재사용 — 여기서 재구현하지 않음
      const name = id.slice("person:".length);
      if (!name) { skippedNames++; continue; } // 정규화 후 빈 이름 방어
      rows.push(nodeInsertSQL(id, name));
      nodeRows++;
      rows.push(mentionInsertSQL(id, idxno));
      mentionRows++;
      if (rows.length >= BATCH_ROWS) await flush();
    }
  }
  await flush();

  console.log(
    `SQL 생성 완료: ${files.length}개 배치 (노드행 ${nodeRows} · mentions행 ${mentionRows} · ` +
    `스킵 줄 ${skippedLines} · 스킵 이름 ${skippedNames})`
  );
  console.log(`위치: ${SQL_DIR}`);

  if (DRY) {
    console.log("--dry: 원격 적용 생략(SQL 파일만 생성)");
    return;
  }

  if (!files.length) {
    console.log("적용할 배치가 없습니다.");
    return;
  }

  console.log(`원격 D1 적용 시작: ${files.length}개 배치`);
  const failed = [];
  let done = 0;
  for (const f of files) {
    const ok = await d1file(f);
    done++;
    if (!ok) { failed.push(f); process.stdout.write("X"); }
    else process.stdout.write(".");
    if (done % 50 === 0) process.stdout.write(` ${done}/${files.length}\n`);
  }
  console.log(`\n적용 완료: ${done}개 · 실패 ${failed.length}개`);
  if (failed.length) {
    await writeFile(FAILLOG, failed.join("\n") + "\n");
    console.log("실패 배치 목록(재실행 시 해당 파일만 다시 --file로 적용 가능):", FAILLOG);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
