#!/usr/bin/env node
// 병합 후보 중 '공백만 다른' 명백 동일인만 자동 soft 병합(대표=등장 많은 쪽). 애매한 건 관리자 검수로 남긴다.
//   soft 병합이라 되돌리기 가능(관리자 검수탭 되돌리기 / canonical_id NULL).
//   사용: node tools/kg/auto-merge-obvious.mjs [--dry]
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DRY = process.argv.includes("--dry");
const NOW = new Date().toISOString();
function wrangler(args) { return execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", maxBuffer: 64 << 20 }); }
function d1(sql) { const o = wrangler(["d1", "execute", "taean-archive", "--remote", "--json", "--command", sql]); const i = o.indexOf("["); return JSON.parse(o.slice(i))[0]?.results ?? []; }
const esc = (s) => String(s).replace(/'/g, "''");

const rows = d1(
  "SELECT c.a_id a_id, c.b_id b_id, na.name a_name, nb.name b_name, c.a_men a_men, c.b_men b_men " +
  "FROM kg_merge_candidates c JOIN kg_nodes na ON na.id=c.a_id JOIN kg_nodes nb ON nb.id=c.b_id " +
  "WHERE c.status='pending' AND REPLACE(na.name,' ','')=REPLACE(nb.name,' ','') AND na.name<>nb.name",
);
console.log(`명백 후보(공백만 다름) ${rows.length}쌍`);
if (!rows.length) { console.log("대상 없음"); process.exit(0); }

const stmts = [];
for (const r of rows) {
  const [canon, merged] = r.a_men >= r.b_men ? [r.a_id, r.b_id] : [r.b_id, r.a_id];
  const cName = r.a_men >= r.b_men ? r.a_name : r.b_name;
  const mName = r.a_men >= r.b_men ? r.b_name : r.a_name;
  console.log(`  '${mName}' → 대표 '${cName}'`);
  // merged가 아직 미병합(canonical_id NULL)일 때만. 대표도 이미 병합됐으면 그 최종대표로 잇도록 COALESCE.
  stmts.push(
    `UPDATE kg_nodes SET canonical_id=COALESCE((SELECT canonical_id FROM kg_nodes WHERE id='${esc(canon)}'),'${esc(canon)}'), updated_at='${esc(NOW)}' WHERE id='${esc(merged)}' AND canonical_id IS NULL;`,
  );
  stmts.push(`UPDATE kg_merge_candidates SET status='merged', updated_at='${esc(NOW)}' WHERE a_id='${esc(r.a_id)}' AND b_id='${esc(r.b_id)}';`);
}
if (DRY) { console.log("--dry: 적용 생략"); process.exit(0); }

const f = join(tmpdir(), "auto-merge-obvious.sql");
writeFileSync(f, stmts.join("\n") + "\n");
try { wrangler(["d1", "execute", "taean-archive", "--remote", "--file", f]); console.log(`완료: ${rows.length}쌍 병합(soft, 되돌리기 가능)`); }
finally { rmSync(f, { force: true }); }
