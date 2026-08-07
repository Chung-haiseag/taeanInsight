// 축제 후보 추출 — 아카이브에서 '○○축제' 정규명을 뽑아 verified=0 event 노드로 적재.
//   로직: backend/src/kg/festival.ts(순수·테스트) 재사용. 시드된 대표축제·일반명(노이즈) 제외.
//   방침: 결정론(무료)·근거 기사·count≥MIN(실재 반복 축제만). 검수(🎪)에서 승격.
//   안정성: rowid 키셋 + 체크포인트 + 지수백오프 재시도 + 기사별 격리.
//   사용: node tools/kg/extract-festivals.mjs [--apply] [--reset]

import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { extractFestivalNames } from "../../backend/src/kg/festival.ts";

const OUT_DIR = new URL("./out/", import.meta.url);
const PROGRESS = new URL("./out/festival-progress.json", import.meta.url);
const SQL_OUT = new URL("./out/festival-nodes.sql", import.meta.url);
const BATCH = 800;
const MIN_COUNT = 3; // 실재 반복 축제만(단발 언급 제외)
const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function d1(sql, { json = true } = {}) {
  const args = ["wrangler", "d1", "execute", "taean-archive", "--remote", ...(json ? ["--json"] : []), "--command", sql];
  let lastErr;
  for (let a = 0; a < 6; a++) {
    try {
      const out = execFileSync("npx", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
      if (!json) return out;
      return JSON.parse(out.slice(out.indexOf("[")))[0].results;
    } catch (e) {
      lastErr = e;
      sleepSync(Math.min(30000, 1000 * 2 ** a));
    }
  }
  throw lastErr;
}
function d1File(path) {
  return execFileSync("npx", ["wrangler", "d1", "execute", "taean-archive", "--remote", "--file", path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ── 진행 상태 ──
let state = { lastRowid: 0, processed: 0, agg: [] };
if (!RESET && existsSync(PROGRESS)) {
  state = JSON.parse(readFileSync(PROGRESS, "utf8"));
  console.log(`↻ 이어하기: rowid>${state.lastRowid}, 처리 ${state.processed}, 후보 ${state.agg.length}`);
}
const agg = new Map(state.agg.map((e) => [e.name, e]));
function saveProgress() { state.agg = [...agg.values()]; writeFileSync(PROGRESS, JSON.stringify(state)); }

// ── 스캔 ──
console.log(`축제 언급 기사 스캔 시작(BATCH=${BATCH})…`);
let last = state.lastRowid;
for (;;) {
  const rows = d1(
    `SELECT rowid AS rid, idxno, year, title, body FROM archive_articles WHERE rowid > ${last} AND (title LIKE '%축제%' OR body LIKE '%축제%') ORDER BY rowid LIMIT ${BATCH}`,
  );
  if (!rows.length) break;
  for (const r of rows) {
    try {
      last = r.rid;
      const names = extractFestivalNames(`${r.title || ""} ${r.body || ""}`);
      for (const name of names) {
        let e = agg.get(name);
        if (!e) { e = { name, count: 0, years: {}, evidence: [], sources: [] }; agg.set(name, e); }
        e.count++;
        if (r.year) e.years[r.year] = 1;
        if (e.evidence.length < 3 && r.title && r.title.includes(name)) e.evidence.push(r.title.trim().slice(0, 80));
        if (e.sources.length < 5 && !e.sources.includes(String(r.idxno))) e.sources.push(String(r.idxno));
      }
    } catch { /* 기사별 격리 */ }
  }
  state.lastRowid = last; state.processed += rows.length; saveProgress();
  console.log(`  …처리 ${state.processed}, 누적 후보 ${agg.size}`);
  if (rows.length < BATCH) break;
}
console.log(`✓ 스캔 완료: 처리 ${state.processed}, 원시 축제명 ${agg.size}`);

// ── 필터 + 노드 SQL ──
const now = "2026-08-08T00:00:00Z";
const kept = [...agg.values()].filter((e) => e.count >= MIN_COUNT).sort((a, b) => b.count - a.count);
const lines = kept.map((e) => {
  const years = Object.keys(e.years).sort();
  const attrs = { kind: "축제", auto: true, count: e.count, years, evidence: e.evidence, sources: e.sources };
  const id = `event:fest:${e.name}`;
  return (
    `INSERT INTO kg_nodes(id,type,name,attrs_json,aliases,source,verified,schema_ver,created_at,updated_at) VALUES (` +
    `${sqlStr(id)},'event',${sqlStr(e.name)},${sqlStr(JSON.stringify(attrs))},${sqlStr(e.name)},${sqlStr(e.sources[0] || "archive")},0,1,${sqlStr(now)},${sqlStr(now)}) ` +
    `ON CONFLICT(id) DO UPDATE SET attrs_json=excluded.attrs_json, updated_at=excluded.updated_at WHERE kg_nodes.verified=0;`
  );
});
writeFileSync(SQL_OUT, lines.join("\n") + "\n");

console.log(`\n── 요약 ──`);
console.log(`축제 후보(count≥${MIN_COUNT}) ${kept.length}개 → ${SQL_OUT.pathname}`);
console.log(`상위 20:`);
for (const e of kept.slice(0, 20)) console.log(`  ${e.count}\t${e.name}`);

if (APPLY) {
  console.log(`\n원격 D1 적재(verified=0)…`);
  console.log(d1File(SQL_OUT.pathname).split("\n").filter((l) => /Executed|error/i.test(l)).slice(0, 2).join("\n"));
  console.log(`✓ 적재 완료`);
} else {
  console.log(`\n(적재 안 함) 검토 후: node tools/kg/extract-festivals.mjs --apply`);
}
