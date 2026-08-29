// 검증된 소속의 **직함**을 지금 코드로 다시 뽑아 비교한다.
//   기존 audit(affiliation_queue.ts)은 (인물,조직)만 보고 직함은 안 봐서, '부군수→군수' 같은
//   접두 잘림이 그대로 살아 있었다. 근거 문장은 추출 당시의 창이라 그대로 다시 넣으면 재현된다.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync } from "node:fs";
import { extractAffiliations } from "/Applications/taean/backend/src/kg/affiliation.ts";
const exec = promisify(execFile);
const ENV = { ...process.env }; delete ENV.NODE_OPTIONS;

async function d1(sql) {
  const { stdout } = await exec("npx",
    ["wrangler","d1","execute","taean-archive","--remote","--command",sql,"--json"],
    { maxBuffer: 128 << 20, cwd: "/Applications/taean/backend", env: ENV });
  return JSON.parse(stdout.slice(stdout.indexOf("[")))[0].results;
}

const rows = await d1(
  "SELECT e.id, e.src_id, e.dst_id, e.attrs_json, n.name AS person FROM kg_edges e " +
  "JOIN kg_nodes n ON n.id=e.src_id WHERE e.rel='belongs_to' AND e.verified=1 AND e.id LIKE 'e:belongs:%'");
console.log(`검증된 기사기반 소속 ${rows.length}건 검사`);

const diffs = [];
for (const r of rows) {
  let a; try { a = JSON.parse(r.attrs_json ?? "{}"); } catch { continue; }
  const ev = Array.isArray(a.evidence) ? a.evidence : (a.evidence ? [a.evidence] : []);
  if (!ev.length) continue;
  // 근거마다 지금 코드로 뽑아, 이 (인물,조직)에 대해 나온 직함을 모은다
  const roles = {};
  for (const e of ev)
    for (const c of extractAffiliations(e))
      if (c.personName === r.person && c.orgId === r.dst_id) roles[c.role] = (roles[c.role] ?? 0) + 1;
  const now = Object.entries(roles).sort((x, y) => y[1] - x[1])[0]?.[0];
  if (now && now !== a.role) diffs.push({ id: r.id, person: r.person, org: r.dst_id, was: a.role, now, ev: ev[0].slice(0, 70) });
}
writeFileSync("/private/tmp/claude-501/-Applications-taean/547b8445-13ab-4942-b547-45fd80f0f168/scratchpad/role_diffs.json",
  JSON.stringify(diffs, null, 1));
console.log(`직함이 달라진 것 ${diffs.length}건`);
const by = {};
for (const d of diffs) by[`${d.was} → ${d.now}`] = (by[`${d.was} → ${d.now}`] ?? 0) + 1;
for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}건`);
