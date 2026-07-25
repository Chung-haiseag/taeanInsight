#!/usr/bin/env node
// tools/kg/derive-coappears.mjs — KG 3단계: kg_mentions(D1) → 공동등장(coappears) 엣지 파생.
//   같은 기사에 등장한 인물 쌍을 집계해 kg_edges(rel=coappears, verified=0)로 적재.
//   ON CONFLICT DO UPDATE(verified=0인 행만)라 멱등 — 재실행하면 최신 집계로 갱신하되, 4단계에서
//   verified=1로 검증된 엣지는 절대 덮어쓰지 않는다(node --check로 문법만 검증, 실행은 사용자가).
// 사용: node derive-coappears.mjs [--dry]   (--dry: SQL만 생성, 원격 적용 생략)
import { writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveCoappears } from "./lib.mjs";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "out");
const SQL_DIR = join(OUT_DIR, "d1");
const FAILLOG = join(OUT_DIR, "coappears_failures.txt");

const DRY = process.argv.includes("--dry");
const BATCH_ROWS = 500; // 배치당 대략 이 정도 INSERT 문 수
const NOW = new Date().toISOString(); // 이번 실행의 단일 타임스탬프(created_at/updated_at)
const ARTICLES_CAP = 20; // attrs.articles에 담는 대표 기사 idxno 상한(용량 방지) — weight는 전체 공유수 유지

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 일시오류 판정 — tools/ebook/reapply-d1.mjs / tools/kg/apply-kg.mjs와 동일 정규식.
const TRANSIENT = /7500|InternalError|internal error|fetch failed|429|5\d\d|Network/i;

// D1 읽기: wrangler d1 execute --command --json (tools/kg/extract-persons.mjs의 d1() 패턴 재사용).
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

// D1 배치 적용 재시도 헬퍼 — tools/kg/apply-kg.mjs / tools/ebook/reapply-d1.mjs의 d1file()과 동일 패턴.
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

function sqlEscape(s) { return String(s).replace(/'/g, "''"); }

// verified는 항상 0(자동추출/미검증) — AI 질의 경로는 verified=1만 주입하므로 이 데이터는
// 답변에 절대 섞이지 않는다. 이 값을 1로 바꾸지 말 것.
// ON CONFLICT: 재실행 시 verified=0인 행만 attrs_json/updated_at을 갱신하고, 4단계에서
// verified=1로 검증된 엣지는 created_at까지 포함해 그대로 보존한다(INSERT OR REPLACE 금지).
function edgeInsertSQL(edge) {
  const repArticles = edge.articles.slice(0, ARTICLES_CAP); // 대표 기사만 저장(용량) — weight는 전체 공유수
  const attrsJson = JSON.stringify({ weight: edge.weight, articles: repArticles });
  return (
    `INSERT INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) ` +
    `VALUES ('${sqlEscape(edge.id)}','${sqlEscape(edge.a)}','coappears','${sqlEscape(edge.b)}','${sqlEscape(attrsJson)}','아카이브 추출',0,1,'${NOW}','${NOW}') ` +
    `ON CONFLICT(id) DO UPDATE SET attrs_json=excluded.attrs_json, updated_at=excluded.updated_at WHERE kg_edges.verified=0;`
  );
}

async function main() {
  await mkdir(SQL_DIR, { recursive: true });

  console.log("kg_mentions 조회 중...");
  const r = await d1("SELECT article_idxno, node_id FROM kg_mentions ORDER BY article_idxno");
  const rows = r?.[0]?.results ?? [];
  console.log(`${rows.length}행 조회`);

  // rows → {articleIdxno: [nodeId,...]}
  const articleToNodeIds = {};
  for (const row of rows) {
    const idxno = String(row.article_idxno);
    (articleToNodeIds[idxno] ??= []).push(row.node_id);
  }
  console.log(`기사 ${Object.keys(articleToNodeIds).length}건`);

  const edges = deriveCoappears(articleToNodeIds); // lib.mjs 재사용 — 여기서 재구현하지 않음
  console.log(`파생 엣지 ${edges.length}개`);

  if (!edges.length) {
    console.log("파생할 엣지가 없습니다.");
    return;
  }

  // 배치 SQL 생성
  const files = [];
  let rows2 = [];
  let batchIdx = 0;

  async function flush() {
    if (!rows2.length) return;
    const fname = `coappears_${String(batchIdx).padStart(3, "0")}.sql`;
    const fpath = join(SQL_DIR, fname);
    await writeFile(fpath, rows2.join("\n") + "\n");
    files.push(fpath);
    batchIdx++;
    rows2 = [];
  }

  for (const edge of edges) {
    rows2.push(edgeInsertSQL(edge));
    if (rows2.length >= BATCH_ROWS) await flush();
  }
  await flush();

  console.log(`SQL 생성 완료: ${files.length}개 배치`);
  console.log(`위치: ${SQL_DIR}`);

  if (DRY) {
    console.log("--dry: 원격 적용 생략(SQL 파일만 생성)");
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
