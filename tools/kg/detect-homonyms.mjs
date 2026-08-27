#!/usr/bin/env node
// tools/kg/detect-homonyms.mjs — 한 노드에 두 사람이 섞인 인물(동명이인) 찾기.
//
// 왜: 지역지에서 동명이인은 흔하다. 소원면 주민자치위원장 '박정희'와 전 대통령이 한 노드로 묶여
//     지역 인물 페이지에 전직 대통령 얼굴이 걸린 적이 있다(2026-08-27). 사람 눈으로는 못 훑는다.
// 어떻게: 이름 뒤에 **전국에서만 쓰는 직함**과 **지역에서만 쓰는 직함**이 둘 다 붙으면 두 사람을 의심한다.
//     본문 전체스캔(LIKE)은 1.3GB D1에서 한 문장도 못 끝내므로 FTS 트라이그램 구절 검색을 쓴다(~7ms).
//
// 쓰기: node tools/kg/detect-homonyms.mjs
//     먼저 out/homonym_names.json에 [["이름", 기사수], …]를 만들어 둔다(아래 SQL).
//       SELECT n.name nm, COUNT(*) c FROM kg_mentions m JOIN kg_nodes n ON n.id=m.node_id
//        AND n.type='person' GROUP BY n.id HAVING c>=20 ORDER BY c DESC
//     결과는 out/homonym_out.json에 이름 단위로 체크포인트되어, 중간에 끊겨도 이어서 돈다.
//
// 의심 인물이 나오면 **반드시 기사 표본을 눈으로 본다.** 확인 후 분리 절차는 db/migrations/060·061과
//   RUNBOOK '동명이인 노드 분리' 항목을 그대로 따른다.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const exec = promisify(execFile);
// ⚠ env에 NODE_OPTIONS: undefined를 넣으면 문자열 "undefined"로 넘어가 자식 node가 죽는다. 키를 지운다.
const CLEAN_ENV = { ...process.env }; delete CLEAN_ENV.NODE_OPTIONS;
const OUT = new URL("./out/", import.meta.url).pathname;   // 이름 목록·결과가 쌓이는 곳

// 전국에서만 쓰는 직함 — 군 단위 지역지에 이 직함으로 나오면 그 사람은 지역 인물이 아니다.
// ⚠ 직함을 늘리면 명령줄이 길어져 wrangler가 통째로 실패한다(12명 묶음 = 11,000자에서 죽었다).
const NAT = ["대통령", "장관", "도지사", "국회의원"];
// 지역에서만 쓰는 직함 — 이장·면장·어촌계장은 전국 인물이 달 일이 없다.
const LOC = ["이장", "면장", "교장", "어촌계장", "부녀회장"];

const expr = (name, titles) => titles.map((t) => `body:"${name} ${t}"`).join(" OR ");

async function d1(sql, tries = 4) {
  for (let t = 1; t <= tries; t++) {
    try {
      const { stdout } = await exec("npx",
        ["wrangler", "d1", "execute", "taean-archive", "--remote", "--command", sql, "--json"],
        { maxBuffer: 64 << 20, env: CLEAN_ENV });
      const i = stdout.indexOf("["); if (i < 0) throw new Error("JSON 없음");
      return JSON.parse(stdout.slice(i))[0].results;
    } catch (e) {
      if (t === tries) throw e;
      await new Promise((r) => setTimeout(r, t * 6000)); // 일시오류는 지수 백오프
    }
  }
}

const names = JSON.parse(readFileSync(`${OUT}homonym_names.json`, "utf8"));
const outPath = `${OUT}homonym_out.json`;
const done = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
// ⚠ D1은 compound SELECT(UNION ALL) 항 수를 좁게 잡는다 — 6개도 'too many terms'로 죽는다.
const BATCH = 3;

for (let i = 0; i < names.length; i += BATCH) {
  const slice = names.slice(i, i + BATCH).filter(([n]) => !(n in done));
  if (!slice.length) continue;
  const sql = slice.map(([n]) =>
    `SELECT '${n}' AS nm,` +
    ` (SELECT COUNT(*) FROM archive_fts WHERE archive_fts MATCH '${expr(n, NAT)}') AS nat,` +
    ` (SELECT COUNT(*) FROM archive_fts WHERE archive_fts MATCH '${expr(n, LOC)}') AS loc`
  ).join(" UNION ALL ");
  try {
    for (const r of await d1(sql)) done[r.nm] = { nat: r.nat, loc: r.loc };
  } catch (e) {
    console.log(`  ✗ ${i}~ 실패: ${JSON.stringify((e.stdout||"").slice(0,300))}`);  // 한 묶음 실패가 전체를 죽이지 않게
    continue;
  }
  writeFileSync(outPath, JSON.stringify(done, null, 0));       // 매 묶음 체크포인트
  if ((i / BATCH) % 8 === 0) console.log(`  ${Object.keys(done).length}/${names.length}`);
}
const flagged = Object.entries(done).filter(([, v]) => v.nat >= 2 && v.loc >= 2);
console.log(`\n완료 ${Object.keys(done).length}명 · 의심 ${flagged.length}명`);
for (const [n, v] of flagged.sort((a, b) => Math.min(b[1].nat, b[1].loc) - Math.min(a[1].nat, a[1].loc)))
  console.log(`  ${n} — 전국직함 ${v.nat}건 · 지역직함 ${v.loc}건`);
