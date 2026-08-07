// 소속(belongs_to) 후보 추출 — 아카이브 기사에서 (인물·조직·직함) 소속 후보를 뽑아 verified=0 엣지 SQL 생성.
//   로직: backend/src/kg/affiliation.ts(순수함수, 테스트됨) 재사용. person id=person:<이름>(동명이인 없음).
//   방침: 결정론 추출(무료)·모든 후보에 근거 기사·기존 person 노드에만 연결(새 인물 안 만듦).
//   안정성: rowid 키셋 페이지네이션 + 체크포인트/이어하기 + 지수백오프 재시도 + 기사별 격리.
//   사용: node tools/kg/extract-affiliations.mjs            → out/affiliation-edges.sql + 요약(적재 안 함)
//         node tools/kg/extract-affiliations.mjs --apply    → 생성 후 원격 D1에 적재(verified=0)
//         node tools/kg/extract-affiliations.mjs --reset     → 진행파일 초기화 후 처음부터

import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { extractAffiliations, ORGS, orgAliasIndex } from "../../backend/src/kg/affiliation.ts";

const OUT_DIR = new URL("./out/", import.meta.url);
const PROGRESS = new URL("./out/affiliation-progress.json", import.meta.url);
const SQL_OUT = new URL("./out/affiliation-edges.sql", import.meta.url);
const BATCH = 800;
const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// ── D1 헬퍼(재시도) ──
function d1(sql, { json = true } = {}) {
  const args = ["wrangler", "d1", "execute", "taean-archive", "--remote", ...(json ? ["--json"] : []), "--command", sql];
  let lastErr;
  for (let a = 0; a < 6; a++) {
    try {
      const out = execFileSync("npx", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
      if (!json) return out;
      const start = out.indexOf("[");
      return JSON.parse(out.slice(start))[0].results;
    } catch (e) {
      lastErr = e;
      const msg = String(e.stderr || e.message || "");
      const transient = /fetch failed|InternalError|Network|429|50\d|timeout|7403|Too many/i.test(msg);
      if (!transient && a > 0) break;
      sleepSync(Math.min(30000, 1000 * 2 ** a));
    }
  }
  throw lastErr;
}
function d1File(path) {
  return execFileSync("npx", ["wrangler", "d1", "execute", "taean-archive", "--remote", "--file", path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ── 대상 필터: 조직 별칭 언급 기사 ──
const aliases = [...new Set(ORGS.flatMap((o) => o.aliases))];
const likeClause = aliases.map((a) => `body LIKE '%${a.replace(/'/g, "''")}%'`).join(" OR ");

// ── 진행 상태 ──
let state = { lastRowid: 0, processed: 0, agg: [] };
if (!RESET && existsSync(PROGRESS)) {
  state = JSON.parse(readFileSync(PROGRESS, "utf8"));
  console.log(`↻ 이어하기: rowid>${state.lastRowid}, 처리 ${state.processed}건, 후보 ${state.agg.length}`);
}
// agg: Map key=name|orgId → {name,orgId,roles:{},count,evidence:[],years:{},sources:[]}
const agg = new Map(state.agg.map((e) => [`${e.name}|${e.orgId}`, e]));

function saveProgress() {
  state.agg = [...agg.values()];
  writeFileSync(PROGRESS, JSON.stringify(state));
}

// ── 스캔 루프 ──
console.log(`대상 별칭 ${aliases.length}종. 스캔 시작(BATCH=${BATCH})…`);
let last = state.lastRowid;
for (;;) {
  const rows = d1(
    `SELECT rowid AS rid, idxno, year, body FROM archive_articles WHERE rowid > ${last} AND (${likeClause}) ORDER BY rowid LIMIT ${BATCH}`,
  );
  if (!rows.length) break;
  for (const r of rows) {
    try {
      last = r.rid;
      const cands = extractAffiliations(r.body || "");
      for (const c of cands) {
        const k = `${c.personName}|${c.orgId}`;
        let e = agg.get(k);
        if (!e) { e = { name: c.personName, orgId: c.orgId, roles: {}, count: 0, evidence: [], years: {}, sources: [] }; agg.set(k, e); }
        e.count++;
        e.roles[c.role] = (e.roles[c.role] || 0) + 1;
        if (r.year) e.years[r.year] = 1;
        if (e.evidence.length < 3 && !e.evidence.includes(c.evidence)) e.evidence.push(c.evidence);
        if (e.sources.length < 5 && !e.sources.includes(String(r.idxno))) e.sources.push(String(r.idxno));
      }
    } catch { /* 기사별 격리: 실패 무시하고 계속 */ }
  }
  state.lastRowid = last;
  state.processed += rows.length;
  saveProgress();
  console.log(`  …처리 ${state.processed}건, 누적 후보 ${agg.size}`);
  if (rows.length < BATCH) break;
}
console.log(`✓ 스캔 완료: 처리 ${state.processed}건, 원시 후보 ${agg.size}쌍`);

// ── 인물 매칭: 기존 person 노드에 있는 이름만 채택(새 인물 안 만듦) ──
const names = [...new Set([...agg.values()].map((e) => e.name))];
const exist = new Set();
for (let i = 0; i < names.length; i += 200) {
  const chunk = names.slice(i, i + 200);
  const inList = chunk.map((n) => sqlStr(n)).join(",");
  const rows = d1(`SELECT name FROM kg_nodes WHERE type='person' AND name IN (${inList})`);
  for (const r of rows) exist.add(r.name);
}
console.log(`인물 매칭: 후보 이름 ${names.length} 중 기존 person ${exist.size} 매칭`);

// ── 신뢰도 + 엣지 SQL 생성 ──
const LEADER = new Set(["조합장", "의장", "부의장", "서장", "청장", "본부장", "지사장", "이사장", "회장", "위원장", "교육장", "군수", "부군수", "군의원"]);
const now = "2026-08-08T00:00:00Z";
const orgName = new Map(ORGS.map((o) => [o.id, o.name]));
const lines = [];
let kept = 0;
const byOrg = {};
const confBuckets = { "≥0.8": 0, "0.6~0.8": 0, "<0.6": 0 };
for (const e of agg.values()) {
  if (!exist.has(e.name)) continue;
  if (e.orgId === "org:taean-news") continue; // 자사 발행처: 기사 말미 바이라인이 타 단체 임원을 오귀속 → 자동추출 제외(노드는 유지)
  const topRole = Object.entries(e.roles).sort((a, b) => b[1] - a[1])[0][0];
  const base = LEADER.has(topRole) ? 0.7 : 0.5;
  const confidence = Math.min(0.95, +(base + 0.04 * (e.count - 1)).toFixed(2));
  confBuckets[confidence >= 0.8 ? "≥0.8" : confidence >= 0.6 ? "0.6~0.8" : "<0.6"]++;
  byOrg[e.orgId] = (byOrg[e.orgId] || 0) + 1;
  const attrs = { role: topRole, count: e.count, confidence, roles: e.roles, years: Object.keys(e.years).sort(), evidence: e.evidence, sources: e.sources };
  const id = `e:belongs:${e.name}__${e.orgId}`;
  const src = e.sources[0] || "archive";
  lines.push(
    `INSERT INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) VALUES (` +
    `${sqlStr(id)},${sqlStr("person:" + e.name)},'belongs_to',${sqlStr(e.orgId)},${sqlStr(JSON.stringify(attrs))},${sqlStr(src)},0,1,${sqlStr(now)},${sqlStr(now)}) ` +
    `ON CONFLICT(id) DO UPDATE SET attrs_json=excluded.attrs_json, source=excluded.source, updated_at=excluded.updated_at WHERE kg_edges.verified=0;`,
  );
  kept++;
}
writeFileSync(SQL_OUT, lines.join("\n") + "\n");

// ── 요약 ──
console.log(`\n── 요약 ──`);
console.log(`소속 후보(matched) ${kept}쌍 → ${SQL_OUT.pathname}`);
console.log(`신뢰도 분포:`, confBuckets);
console.log(`조직별 상위:`);
for (const [oid, n] of Object.entries(byOrg).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${orgName.get(oid) || oid}: ${n}`);

// ── 적재(옵션) ──
if (APPLY) {
  console.log(`\n원격 D1 적재(verified=0)…`);
  console.log(d1File(SQL_OUT.pathname).split("\n").filter((l) => /Executed|error/i.test(l)).slice(0, 3).join("\n"));
  console.log(`✓ 적재 완료`);
} else {
  console.log(`\n(적재 안 함) 검토 후: node tools/kg/extract-affiliations.mjs --apply`);
}
