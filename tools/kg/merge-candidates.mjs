#!/usr/bin/env node
// tools/kg/merge-candidates.mjs — KG 병합 후보 탐지: kg_nodes(person, 미병합) → genCandidates → 맥락(이웃 겹침) 필터 → kg_merge_candidates 적재.
//   순수 로직(블로킹+편집거리≤1, 맥락겹침)은 ./merge-lib.mjs 재사용(재구현 금지). D1 읽기/쓰기 패턴은
//   extract-persons.mjs(읽기, --json)/apply-kg.mjs(d1file 재시도 쓰기)와 동일.
//   이름 편집거리만으로는 34,510명 규모에서 596,039개 후보(대부분 오탐: 김철수/김철호처럼 실제로는
//   다른 사람)가 나와, 같은 기사에 공동등장(coappears)한 이웃 노드 집합이 많이 겹치는 쌍만 남긴다
//   (OCR/표기변형으로 같은 인물이면 이웃도 대부분 같음).
// 사용: node merge-candidates.mjs [--dry]   (--dry: SQL만 생성, 원격 적용 생략)
import { writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { genCandidates, contextOverlap } from "./merge-lib.mjs";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "out");
const SQL_DIR = join(OUT_DIR, "d1");
const FAILLOG = join(OUT_DIR, "merge_cand_failures.txt");

const DRY = process.argv.includes("--dry");
const BATCH_ROWS = 500; // 배치당 대략 이 정도 INSERT 문 수
const NOW = new Date().toISOString(); // 이번 실행의 단일 타임스탬프(created_at/updated_at)
// 맥락(이웃 겹침) 필터 임계값 — 튜닝 포인트. 공유 이웃 수 & containment(작은 쪽 기준) 둘 다 만족해야 통과.
const MIN_SHARED = 2;
const MIN_CONTAINMENT = 0.5;
const HUB_DEG = 300; // 이웃이 이보다 많은 인물=초허브(기자/편집인 등) — 변별력 없어 겹침 계산에서 제외

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

// coappears 엣지 전체 조회 전용 — kg_edges(rel='coappears')는 약 127만 행(~90MB JSON)이라
// 기본 d1()의 maxBuffer(64MB)로는 부족. 파싱 방식(첫 '['부터)과 재시도 로직은 d1()과 동일.
async function d1Big(sql, tries = 5) {
  for (let t = 1; t <= tries; t++) {
    try {
      const { stdout } = await exec(
        "npx",
        ["wrangler", "d1", "execute", "taean-archive", "--remote", "--command", sql, "--json"],
        { maxBuffer: 300 * 1024 * 1024 }
      );
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

  const nameCands = genCandidates(rows); // 순수 로직 재사용 — 여기서 재구현하지 않음
  console.log(`${nameCands.length}개 이름 후보 생성`);
  if (!nameCands.length) { console.log("생성된 후보가 없습니다."); return; }

  // 맥락(이웃 겹침) 필터 — 공동등장(coappears) 엣지로 인접 집합을 만들어, 실제로 같은 문맥에서
  // 함께 언급된 쌍만 남긴다(이름만 비슷한 다른 사람 배제).
  console.log("kg_edges(coappears) 조회 중...");
  const edgeResult = await d1Big("SELECT src_id, dst_id FROM kg_edges WHERE rel='coappears'");
  const edgeRows = edgeResult?.[0]?.results ?? [];
  console.log(`${edgeRows.length}개 coappears 엣지 조회`);

  const adj = new Map();
  function link(x, y) {
    if (x === y) return; // self-loop 제외
    let s = adj.get(x);
    if (!s) { s = new Set(); adj.set(x, s); }
    s.add(y);
  }
  for (const e of edgeRows) {
    link(e.src_id, e.dst_id);
    link(e.dst_id, e.src_id);
  }

  // 초허브(이웃 과다 인물) 식별 → 겹침 계산에서 제외해 변별력 확보.
  // (초허브는 거의 모두와 공동등장하므로 "함께 등장했다"가 같은 사람 증거가 못 됨)
  const hubs = new Set();
  for (const [id, s] of adj) if (s.size > HUB_DEG) hubs.add(id);
  console.log(`초허브 ${hubs.size}명(이웃>${HUB_DEG}) — 겹침 계산에서 제외`);
  const adjNoHub = new Map();
  for (const [id, s] of adj) {
    const out = new Set();
    for (const x of s) if (!hubs.has(x)) out.add(x);
    adjNoHub.set(id, out);
  }

  const candidates = nameCands.filter((c) => {
    // 초허브가 한쪽이면 (그가 거의 모두와 공동등장하므로) 겹침으로 같은 사람 판별이 불가 → v1 큐에서 제외.
    if (hubs.has(c.a_id) || hubs.has(c.b_id)) return false;
    const o = contextOverlap(adjNoHub.get(c.a_id), adjNoHub.get(c.b_id));
    return o.shared >= MIN_SHARED && o.containment >= MIN_CONTAINMENT;
  });
  console.log(`이름 후보 ${nameCands.length} → 맥락 필터 후 ${candidates.length}`);
  if (!candidates.length) { console.log("맥락 필터 통과 후보가 없습니다."); return; }

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
