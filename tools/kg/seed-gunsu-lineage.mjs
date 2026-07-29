#!/usr/bin/env node
// tools/kg/seed-gunsu-lineage.mjs — 역대 태안군수 '검증된 사실' 시드(군수 Fact 레이어 입력).
//
//   ⚠️ 아래 LINEAGE는 비어 있다. 태안군·중앙선관위 공식 기록에서 '검증된 값만' 채운 뒤 --confirm으로 실행하라.
//      값 입력은 운영자 몫이다(정부 기록은 지어내지 않는다). 채우지 않으면 아무것도 하지 않는다.
//
//   각 행: { ordinal, name, start:'YYYY-MM-DD', end:'YYYY-MM-DD'|null(현직), personId?:'기존 인물노드 id면 연결' }
//     - personId를 주면 그 인물노드를 verified=1로 승격해 연결(인물 탐색·관계와 이어짐). 없으면 person:gunsu:<ordinal> 생성.
//   생성물: office 노드(office:taean-gunsu, verified=1) + 인물노드(verified=1) + held 엣지(verified=1).
//   getGunsuLineage가 verified=1만 읽으므로, 여기 넣은 값이 즉시 AI 답변의 '[확인된 사실] 역대 태안군수'로 쓰인다.
//
// 사용: node tools/kg/seed-gunsu-lineage.mjs --dry       # 미리보기(쓰기 없음)
//       node tools/kg/seed-gunsu-lineage.mjs --confirm   # 실제 반영
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OFFICE_ID = "office:taean-gunsu";
const OFFICE_NAME = "태안군수";
const OFFICE_SOURCE = "태안군·중앙선관위 공식 기록"; // 필요시 출처 문구 수정

// 역대 태안군수 — 태안신문 아카이브 근거로 작성한 초안(운영자 확정 2026-07). 11·12대 재보궐 등 일부
// 시작/종료일은 근사치(민선 취임 표준 7.1). 정확일 확인되면 값만 고치고 재실행하면 upsert로 갱신된다.
const LINEAGE = [
  { ordinal: 6,  name: "김경년", start: "1994-10-07", end: "1995-06-30", personId: "person:김경년" }, // 관선
  { ordinal: 7,  name: "윤형상", start: "1995-07-01", end: "1998-06-30", personId: "person:윤형상" }, // 민선1기
  { ordinal: 8,  name: "윤형상", start: "1998-07-01", end: "2002-06-30", personId: "person:윤형상" }, // 민선2기(재선)
  { ordinal: 9,  name: "진태구", start: "2002-07-01", end: "2006-06-30", personId: "person:진태구" }, // 민선3기
  { ordinal: 10, name: "진태구", start: "2006-07-01", end: "2010-06-30", personId: "person:진태구" }, // 민선4기
  { ordinal: 11, name: "김세호", start: "2010-07-01", end: "2011-03-31", personId: "person:김세호" }, // 민선5기(군수직 상실)
  { ordinal: 12, name: "진태구", start: "2011-05-01", end: "2014-06-30", personId: "person:진태구" }, // 민선5기(재보궐)
  { ordinal: 13, name: "한상기", start: "2014-07-01", end: "2018-06-30", personId: "person:한상기" }, // 민선6기
  { ordinal: 14, name: "가세로", start: "2018-07-01", end: "2022-06-30", personId: "person:가세로" }, // 민선7기
  { ordinal: 15, name: "가세로", start: "2022-07-01", end: "2026-06-30", personId: "person:가세로" }, // 민선8기(재선)
  { ordinal: 16, name: "윤희신", start: "2026-07-01", end: null,         personId: "person:윤희신" }, // 민선9기(현직)
];

const DRY = process.argv.includes("--dry");
const CONFIRM = process.argv.includes("--confirm");
const NOW = new Date().toISOString();
const esc = (s) => String(s).replace(/'/g, "''");
const sqlVal = (v) => (v == null ? "NULL" : `'${esc(v)}'`);

if (!LINEAGE.length) {
  console.log("LINEAGE가 비어 있습니다. 스크립트 상단 LINEAGE 배열에 검증된 역대 군수를 채운 뒤 다시 실행하세요.");
  process.exit(0);
}
if (!DRY && !CONFIRM) {
  console.log("안전을 위해 --dry(미리보기) 또는 --confirm(실제 반영) 중 하나를 지정하세요.");
  process.exit(1);
}

const stmts = [];
// office 노드 upsert
stmts.push(
  `INSERT INTO kg_nodes(id,type,name,source,verified,schema_ver,created_at,updated_at) ` +
  `VALUES('${esc(OFFICE_ID)}','office','${esc(OFFICE_NAME)}','${esc(OFFICE_SOURCE)}',1,1,'${esc(NOW)}','${esc(NOW)}') ` +
  `ON CONFLICT(id) DO UPDATE SET name=excluded.name, source=excluded.source, verified=1, updated_at=excluded.updated_at;`,
);

for (const row of LINEAGE) {
  const pid = row.personId || `person:gunsu:${row.ordinal}`;
  const attrs = JSON.stringify({ ordinal: row.ordinal, start: row.start ?? null, end: row.end ?? null });
  const eid = `held:${pid}:${OFFICE_ID}:${row.ordinal}`; // 재선(같은 인물 여러 대) 대비 대수 포함
  console.log(`  ${row.ordinal}대 ${row.name} (${row.start ?? "?"}~${row.end ?? "현재"}) → 인물 ${pid}`);
  // 인물 노드 upsert(검증 승격). 기존 노드면 이름은 유지(덮어쓰지 않음), verified만 1로.
  stmts.push(
    `INSERT INTO kg_nodes(id,type,name,verified,schema_ver,created_at,updated_at) ` +
    `VALUES('${esc(pid)}','person','${esc(row.name)}',1,1,'${esc(NOW)}','${esc(NOW)}') ` +
    `ON CONFLICT(id) DO UPDATE SET verified=1, updated_at=excluded.updated_at;`,
  );
  // held 엣지 upsert(검증)
  stmts.push(
    `INSERT INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) ` +
    `VALUES('${esc(eid)}','${esc(pid)}','held','${esc(OFFICE_ID)}','${esc(attrs)}',${sqlVal(OFFICE_SOURCE)},1,1,'${esc(NOW)}','${esc(NOW)}') ` +
    `ON CONFLICT(id) DO UPDATE SET attrs_json=excluded.attrs_json, verified=1, source=excluded.source, updated_at=excluded.updated_at;`,
  );
}

if (DRY) { console.log(`--dry: ${LINEAGE.length}명 미리보기(쓰기 없음). SQL ${stmts.length}문.`); process.exit(0); }

const f = join(tmpdir(), "seed-gunsu-lineage.sql");
writeFileSync(f, stmts.join("\n") + "\n");
try {
  execFileSync("npx", ["wrangler", "d1", "execute", "taean-archive", "--remote", "--file", f], { stdio: "inherit" });
  console.log(`완료: 역대 군수 ${LINEAGE.length}명 시드(office+인물+held, 모두 verified=1). '역대 군수' 질의에 즉시 반영.`);
} finally { rmSync(f, { force: true }); }
