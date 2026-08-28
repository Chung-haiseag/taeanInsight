// 광고 언급 삭제로 어긋난 공동등장 엣지를 **영향받은 노드만** 다시 계산한다.
//   전체 재계산(derive-coappears)은 무겁고, 광고에 걸렸던 555개 노드만 손대면 된다.
//   ⚠ verified=1로 사람이 검수한 엣지는 건드리지 않는다(DELETE·INSERT 모두 verified=0만).
//   ⚠ COUNT(*)가 아니라 COUNT(DISTINCT article)다. 한 묶음에 A와 B가 **둘 다** 들어가면
//     (A,B,기사)와 (B,A,기사)가 모두 잡혀 같은 기사를 두 번 센다(김승진↔김웅겸 실제 3인데 6이 됐다).
//   ⚠ D1 제약: DELETE와 INSERT를 한 파일에 넣으면 시간 초과, `INSERT … SELECT … ON CONFLICT`는 문법오류.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
const exec = promisify(execFile);
const ENV = { ...process.env }; delete ENV.NODE_OPTIONS;
const SP = "/private/tmp/claude-501/-Applications-taean/547b8445-13ab-4942-b547-45fd80f0f168/scratchpad";
const nodes = JSON.parse(readFileSync(`${SP}/affected_nodes.json`, "utf8"));

async function runFile(sql, label) {
  writeFileSync(`${SP}/_tmp.sql`, sql);
  for (let t = 1; t <= 4; t++) {
    try {
      await exec("npx", ["wrangler","d1","execute","taean-archive","--remote","--file",`${SP}/_tmp.sql`],
        { maxBuffer: 64 << 20, cwd: "/Applications/taean/backend", env: ENV });
      return true;
    } catch { await new Promise((r) => setTimeout(r, t * 8000)); }
  }
  console.log(`  ✗ ${label} 실패`); return false;
}

let ok = 0;
for (let i = 0; i < nodes.length; i += 25) {
  const batch = nodes.slice(i, i + 25);
  const list = batch.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
  await runFile(
    `DELETE FROM kg_edges WHERE rel='coappears' AND verified=0 AND (src_id IN (${list}) OR dst_id IN (${list}));`,
    `삭제 ${i}`);
  const inserted = await runFile(
    `INSERT OR IGNORE INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at)
     SELECT 'coappears:'||lo||'|'||hi, lo, 'coappears', hi, json_object('weight', w), '아카이브 추출', 0, 1, datetime('now'), datetime('now')
     FROM (SELECT MIN(m1.node_id,m2.node_id) AS lo, MAX(m1.node_id,m2.node_id) AS hi, COUNT(DISTINCT m1.article_idxno) AS w
           FROM kg_mentions m1
           JOIN kg_mentions m2 ON m2.article_idxno=m1.article_idxno AND m2.node_id<>m1.node_id AND m2.node_id LIKE 'person:%'
           WHERE m1.node_id IN (${list}) GROUP BY lo, hi);`,
    `삽입 ${i}`);
  if (inserted) ok += batch.length;
  if (i % 100 === 0) console.log(`  ${Math.min(i + 25, nodes.length)}/${nodes.length}`);
}
console.log(`재계산 완료 ${ok}/${nodes.length}`);
