#!/usr/bin/env node
// 디지털화 결과(JSONL) → 라이브 적재 일괄 처리
//   ① 띄어쓰기 교정(fix-spacing, 글자 동일성 가드) → ② 버전URL 부여 → ③ D1 적재(import-d1)
//   → ④ 충실도 백필 → ⑤ 건수 검증
// 기본값: "D1에 아직 없는 발행일(새 호)만" 적재 — 기존 호의 검수기록(verify_status)을 보호한다.
//
// 사용:
//   export ANTHROPIC_API_KEY=...               (교정용)
//   node publish.mjs                            # 새 호만 (안전, 기본)
//   node publish.mjs --dates 20030307,20030314  # 특정 호만
//   node publish.mjs --all                      # 전체 재적재 (⚠️ 검수기록 초기화 — 확인 프롬프트)
//   node publish.mjs --skip-spacing             # 교정 생략
//
// 전체 운영 흐름: 새 PDF 폴더 추가 → sh archive.sh → node publish.mjs → 끝.

import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const JSONL = join(__dir, "out", "ebook_articles.jsonl");
const IMPORT_JSONL = join(__dir, "out", "ebook_articles.import.jsonl");
const IMPORTER = join(__dir, "..", "backfill", "import-d1.mjs");
const SQL_DIR = join(__dir, "..", "backfill", "out", "d1");

function flag(n) { return process.argv.includes(n); }
function arg(n) { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : null; }
async function sh(c, a, opts = {}) { return exec(c, a, { maxBuffer: 64e6, ...opts }); }
async function d1(sqlOrFile, isFile = false) {
  const args = ["wrangler", "d1", "execute", "taean-archive", "--remote", isFile ? "--file" : "--command", sqlOrFile, "--json"];
  const { stdout } = await sh("npx", args);
  // wrangler가 JSON 앞에 진행 메시지("├ Checking…")를 찍는 경우가 있어 JSON 시작점부터 파싱
  const i = stdout.indexOf("[");
  if (i === -1) throw new Error("wrangler 응답에 JSON 없음: " + stdout.slice(0, 200));
  return JSON.parse(stdout.slice(i));
}

async function main() {
  // 대상 결정: 새 호만(기본) / --dates / --all
  const all = (await readFile(JSONL, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  const jsonlDates = [...new Set(all.map((a) => a.date))].sort();

  let targetDates;
  if (flag("--all")) {
    console.log("⚠️  --all: 전체 재적재는 기존 검수기록(verify_status)을 초기화합니다.");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise((res) => rl.question("계속할까요? [y/N] ", res)); rl.close();
    if (ans.trim().toLowerCase() !== "y") { console.log("중단"); return; }
    targetDates = jsonlDates;
  } else if (arg("--dates")) {
    targetDates = arg("--dates").split(",").map((s) => s.trim());
  } else {
    // D1에 이미 있는 발행일 제외 → 새 호만
    const r = await d1("SELECT DISTINCT replace(substr(published_at,1,10),'-','') AS d FROM archive_articles WHERE idxno BETWEEN 90000001 AND 90099999;");
    const existing = new Set((r[0]?.results ?? []).map((x) => x.d));
    targetDates = jsonlDates.filter((d) => !existing.has(d));
  }
  const target = all.filter((a) => targetDates.includes(a.date));
  if (!target.length) { console.log("적재할 새 호가 없습니다. (옵션: --dates YYYYMMDD,... 또는 --all)"); return; }
  console.log(`적재 대상: ${targetDates.join(", ")} · 기사 ${target.length}건`);

  // ① 띄어쓰기 교정: 대상 호를 fix-spacing으로 보정(글자 동일성 가드).
  //    --no-d1 → JSONL만 갱신하고, 아래 ③에서 보정된 본문으로 적재한다.
  //    --skip-spacing 또는 ANTHROPIC_API_KEY 없으면 생략.
  if (flag("--skip-spacing")) {
    console.log("① 띄어쓰기: --skip-spacing (생략)");
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.log("① 띄어쓰기: ANTHROPIC_API_KEY 없음 → 생략 (나중에 fix-spacing.mjs 실행 권장)");
  } else {
    console.log(`① 띄어쓰기 교정 중 (${targetDates.length}개 호)...`);
    const fixer = join(__dir, "fix-spacing.mjs");
    await sh("node", [fixer, "--dates", targetDates.join(","), "--no-d1", "--conc", "10"], { stdio: "inherit" });
    // 보정본 다시 읽어 target 갱신
    const reread = (await readFile(JSONL, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    const byIdx = new Map(reread.map((a) => [a.idxno, a]));
    for (let i = 0; i < target.length; i++) target[i] = byIdx.get(target[i].idxno) || target[i];
    console.log("① 띄어쓰기 교정 완료");
  }

  // ② 버전 URL 부여한 import 파일 생성 (target만)
  const V = "v" + Math.floor(Date.now() / 1000);
  const lines = target.map((a) => {
    const b = { ...a };
    if (b.leadImage) b.leadImage = b.leadImage.split("?")[0] + "?" + V;
    b.images = [];
    return JSON.stringify(b);
  });
  await writeFile(IMPORT_JSONL, lines.join("\n") + "\n");
  console.log(`② import 파일 ${lines.length}건 · 버전 ${V}`);

  // ③ D1 적재
  await sh("node", [IMPORTER, "--in", IMPORT_JSONL, "--batch", "50"]);
  const { stdout: ls } = await sh("ls", [SQL_DIR]);
  for (const f of ls.split("\n").filter((x) => x.startsWith("insert_"))) {
    await d1(join(SQL_DIR, f), true);
  }
  console.log("③ D1 적재 완료");

  // ④ 충실도 백필 (target만)
  const fsql = target.map((a) => `UPDATE archive_articles SET faithfulness=${a.faithfulness} WHERE idxno=${a.idxno};`).join("\n");
  const ftmp = join(__dir, "out", "publish_faith.sql");
  await writeFile(ftmp, fsql + "\n");
  await d1(ftmp, true);
  console.log("④ 충실도 백필 완료");

  // ⑤ 검증
  const chk = await d1("SELECT COUNT(*) n, MIN(idxno) lo, MAX(idxno) hi FROM archive_articles WHERE idxno BETWEEN 90000001 AND 90099999;");
  console.log("⑤ D1 ebook 현황:", JSON.stringify(chk[0]?.results?.[0]));
  console.log("\n=== publish 완료 === 관리자 검수: /admin (전자북 검수 섹션에 새 호 표시)");
}
main().catch((e) => { console.error(e); process.exit(1); });
