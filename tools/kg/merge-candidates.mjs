#!/usr/bin/env node
// tools/kg/merge-candidates.mjs — KG 병합 후보 탐지: kg_nodes(person, 미병합) → genCandidates → kg_merge_candidates 적재.
//   순수 로직(블로킹+편집거리≤1)은 ./merge-lib.mjs 재사용(재구현 금지). D1 읽기/쓰기 패턴은
//   extract-persons.mjs(읽기, --json)/apply-kg.mjs(d1file 재시도 쓰기)와 동일.
// 사용: node merge-candidates.mjs [--dry]   (--dry: SQL만 생성, 원격 적용 생략)
import { writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { genCandidates } from "./merge-lib.mjs";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "out");
const SQL_DIR = join(OUT_DIR, "d1");
const FAILLOG = join(OUT_DIR, "merge_cand_failures.txt");

const DRY = process.argv.includes("--dry");
const BATCH_ROWS = 500; // 배치당 대략 이 정도 INSERT 문 수
const NOW = new Date().toISOString(); // 이번 실행의 단일 타임스탬프(created_at/updated_at)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 일시오류 판정 — apply-kg.mjs/extract-persons.mjs와 동일 정규식.
const TRANSIENT = /7500|InternalError|internal error|fetch failed|429|5\d\d|Network/i;

// D1 읽기: wrangler d1 execute --command --json (extract-persons.mjs의 d1() 패턴 재사용).
async function d1(sql, tries = 5) {
  for (let t = 1; t <= tries; t++) {
    try {
      const { stdout } = await exec(
        "npx",
        ["wrangler", "d1", "execute", "taean-archive", "--remote", "--command", sql, "--json"],
        { maxBuffer: 64 * 1024 * 1024 }
      );
      // wrangler가 JSON 앞에 진행 메시지를 찍는 경우가 있어 JSON 시작점부터 파싱.
      const i = stdout.indexOf("[");
      if (i === -1) throw new Error("wrangler 응답에 JSON 없음: " + stdout.slice(0, 200));
      return JSON.parse(stdout.slice(i));
    } catch (e) {
      const msg = String(e.stdout || e.stderr || e.message || "");
      if (t < tries && TRANSIENT.test(msg)) { await sleep(1500 * t * t); continue; }
      throw e;
    }
  }
}

// D1 배치 적용 재시도 헬퍼 — apply-kg.mjs의 d1file()과 동일 패턴(동일 transient 판정).
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
      const transient = TRANSIENT.test(msg);
      if (t < tries && transient) { await sleep(1500 * t * t); continue; }
      if (t < tries) { await sleep(1500 * t); continue; }
      return false;
    }
  }
  return false;
}

function sqlEscape(s) { return String(s).replace(/'/g, "''"); }
function numOr0(n) { return Number.isFinite(n) ? n : 0; }

function candidateInsertSQL(c) {
  const a = sqlEscape(c.a_id);
  const b = sqlEscape(c.b_id);
  const reason = sqlEscape(c.reason ?? "");
  const score = numOr0(c.score);
  const aMen = numOr0(c.a_men);
  const bMen = numOr0(c.b_men);
  return (
    `INSERT OR IGNORE INTO kg_merge_candidates(a_id,b_id,reason,score,a_men,b_men,status,created_at,updated_at) ` +
    `VALUES ('${a}','${b}','${reason}',${score},${aMen},${bMen},'pending','${NOW}','${NOW}');`
  );
}

// 후보 미리보기(genCandidates가 이미 a_id<b_id 정렬쌍으로 만들어 줌 — 여기서 재정렬하지 않음)를
// BATCH_ROWS개씩 잘라 SQL 파일로 저장. INSERT OR IGNORE + PK(a_id,b_id)라 기존 status(merged/kept 등)는
// 보존되고, 새 후보만 pending으로 추가된다(재실행해도 안전 — 별도 dedup 불필요).
async function main() {
  await mkdir(SQL_DIR, { recursive: true });

  const sql =
    "SELECT n.id, n.name, (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) AS mentions " +
    "FROM kg_nodes n WHERE n.type='person' AND n.canonical_id IS NULL";
  console.log("kg_nodes(person, 미병합) 조회 중...");
  const result = await d1(sql);
  const rows = result?.[0]?.results ?? [];
  console.log(`${rows.length}건 조회`);
  if (!rows.length) { console.log("대상 노드가 없습니다."); return; }

  const candidates = genCandidates(rows); // 순수 로직 재사용 — 여기서 재구현하지 않음
  console.log(`${candidates.length}개 병합 후보 생성`);
  if (!candidates.length) { console.log("생성된 후보가 없습니다."); return; }

  // 배치 SQL 생성
  const files = [];
  let rows_ = [];
  let batchIdx = 0;

  async function flush() {
    if (!rows_.length) return;
    const fname = `merge_cand_${String(batchIdx).padStart(3, "0")}.sql`;
    const fpath = join(SQL_DIR, fname);
    await writeFile(fpath, rows_.join("\n") + "\n");
    files.push(fpath);
    batchIdx++;
    rows_ = [];
  }

  for (const c of candidates) {
    rows_.push(candidateInsertSQL(c));
    if (rows_.length >= BATCH_ROWS) await flush();
  }
  await flush();

  console.log(`SQL 생성 완료: ${files.length}개 배치`);
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
