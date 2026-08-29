// 검증된 소속에 **새 추출 규칙**을 다시 적용한다.
//   전체 재추출은 verified=1을 덮어쓰지 않게 돼 있어(도구 설계) 기존 799건이 안 고쳐진다.
//   저장된 근거 창에 지금 코드를 돌려, ① 아예 안 나오면 규칙이 거부한 것 ② 직함이 달라지면 교정.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync } from "node:fs";
import { extractAffiliations } from "/Applications/taean/backend/src/kg/affiliation.ts";
const exec = promisify(execFile);
const ENV = { ...process.env }; delete ENV.NODE_OPTIONS;
const SP = "/private/tmp/claude-501/-Applications-taean/547b8445-13ab-4942-b547-45fd80f0f168/scratchpad";

const { stdout } = await exec("npx", ["wrangler","d1","execute","taean-archive","--remote","--json","--command",
  "SELECT e.id, e.src_id, e.dst_id, e.attrs_json, n.name AS person FROM kg_edges e " +
  "JOIN kg_nodes n ON n.id=e.src_id WHERE e.rel='belongs_to' AND e.verified=1 AND e.id LIKE 'e:belongs:%'"],
  { maxBuffer: 128 << 20, cwd: "/Applications/taean/backend", env: ENV });
const rows = JSON.parse(stdout.slice(stdout.indexOf("[")))[0].results;

// ⚠ 조직 목록의 정본은 D1이다. 코드의 기본 22개만 쓰면 군청 부서('농정과')·교육지원청·적십자가
//   목록에 없어 그쪽 소속이 통째로 '재현 안 됨'으로 나온다(처음에 293건이 그래서 나왔다).
const og = await exec("npx", ["wrangler","d1","execute","taean-archive","--remote","--json","--command",
  "SELECT id, name, COALESCE(aliases,'') aliases FROM kg_nodes WHERE type='org' AND verified=1"],
  { maxBuffer: 64 << 20, cwd: "/Applications/taean/backend", env: ENV });
const ORGS_D1 = JSON.parse(og.stdout.slice(og.stdout.indexOf("[")))[0].results.map((o) => ({
  id: o.id, name: o.name, cat: "", aliases: [o.name, ...String(o.aliases || "").split(",")].map((x) => x.trim()).filter(Boolean),
}));
console.log(`D1 조직 ${ORGS_D1.length}개 사용`);
console.log(`검증된 기사기반 소속 ${rows.length}건 재검사`);

const rejected = [], rerole = [];
for (const r of rows) {
  let a; try { a = JSON.parse(r.attrs_json ?? "{}"); } catch { continue; }
  const ev = Array.isArray(a.evidence) ? a.evidence : (a.evidence ? [a.evidence] : []);
  if (!ev.length) continue;
  const roles = {};
  for (const e of ev)
    for (const c of extractAffiliations(e, ORGS_D1))
      if (c.personName === r.person && c.orgId === r.dst_id) roles[c.role] = (roles[c.role] ?? 0) + 1;
  const now = Object.entries(roles).sort((x, y) => y[1] - x[1])[0]?.[0];
  if (!now) rejected.push({ id: r.id, person: r.person, org: r.dst_id, was: a.role, ev: ev[0].slice(0, 72) });
  else if (now !== a.role) rerole.push({ id: r.id, person: r.person, org: r.dst_id, was: a.role, now, ev: ev[0].slice(0, 72) });
}
writeFileSync(`${SP}/recheck2.json`, JSON.stringify({ rejected, rerole }, null, 1));
console.log(`\n규칙이 거부(근거로 재현 안 됨): ${rejected.length}건`);
const by = {};
for (const x of rejected) by[`${x.org.replace("org:","")} ${x.was}`] = (by[`${x.org.replace("org:","")} ${x.was}`] ?? 0) + 1;
for (const [k, v] of Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0, 10)) console.log(`   ${k}: ${v}건`);
console.log(`\n직함 변경: ${rerole.length}건`);
const by2 = {};
for (const x of rerole) by2[`${x.was}→${x.now}`] = (by2[`${x.was}→${x.now}`] ?? 0) + 1;
for (const [k, v] of Object.entries(by2).sort((a,b)=>b[1]-a[1])) console.log(`   ${k}: ${v}건`);
