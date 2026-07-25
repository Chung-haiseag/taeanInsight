#!/usr/bin/env node
// KG 3단계 — 인물 추출: archive_articles 본문(연도별) → Gemini로 인물명 추출 → 충실도 필터 → JSONL.
//   결과는 apply-kg.mjs가 kg_nodes(person, verified=0)+kg_mentions로 적재(이 스크립트는 D1에 쓰지 않음).
// 사용: export GEMINI_API_KEY=...
//       node extract-persons.mjs 2015 2016   [--conc 4] [--limit N]
//   → out/kg_mentions.jsonl append(줄당 {idxno, names}) + out/extract_checkpoint.txt(처리 완료 idxno, 이어하기)
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { faithfulFilter } from "./lib.mjs";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "out");
const JSONL = join(OUT_DIR, "kg_mentions.jsonl");
const CHECKPOINT = join(OUT_DIR, "extract_checkpoint.txt");
const FAILLOG = join(OUT_DIR, "extract_failures.txt");

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

function arg(n, d) { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : d; }
const YEARS = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));
const CONC = Math.max(1, Number(arg("--conc", "4")) || 4);
const LIMIT = Math.max(0, Number(arg("--limit", "0")) || 0);

if (!GEMINI_KEY) { console.error("GEMINI_API_KEY 필요"); process.exit(1); }
if (!YEARS.length) { console.error("연도 인자 필요 (예: node extract-persons.mjs 2015 2016)"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 일시오류 판정 — reapply-d1.mjs(tools/ebook)와 동일 정규식.
const TRANSIENT = /7500|InternalError|internal error|fetch failed|429|5\d\d|Network/i;

// D1 읽기: wrangler d1 execute --command --json (publish.mjs의 d1() 패턴 재사용).
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

function prompt(body) {
  return `다음 기사 본문에 등장하는 사람(인물)의 실명만 JSON 배열로 반환하라.
- 직함·존칭 제외(예: "이완섭 군수" → "이완섭").
- 본문에 실제로 나온 이름만. 추측·보완 금지.
- 사람 아닌 것(기관·지명·단체) 제외.
출력: {"names": ["...", "..."]}  (없으면 {"names": []})
본문:
${body}`;
}

// Gemini generateContent 호출 — tools/ebook/restructure-gemini.mjs의 gemini() 헬퍼 패턴 재사용
// (thinkingBudget:0 필수). 네트워크 예외(fetch failed 등)와 429/5xx 둘 다 지수 백오프 재시도.
async function gemini(body, tries = 5) {
  let res, lastErr;
  for (let t = 1; t <= tries; t++) {
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(120_000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt(body) }] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 2048,
              responseMimeType: "application/json",
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        }
      );
    } catch (e) {
      lastErr = e;
      if (t < tries && TRANSIENT.test(String(e?.message || e))) { await sleep(1500 * t * t); continue; }
      throw e;
    }
    if ((res.status === 429 || res.status >= 500) && t < tries) { await sleep(1500 * t * t); continue; }
    break;
  }
  if (!res || !res.ok) {
    const detail = res ? (await res.text()).slice(0, 200) : String(lastErr?.message || lastErr);
    throw new Error(`Gemini ${res ? res.status : "요청 실패"}: ${detail}`);
  }
  const j = await res.json();
  const out = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  let names = [];
  try {
    const p = JSON.parse(out);
    names = Array.isArray(p) ? p : p.names || [];
  } catch {
    const m = out.match(/\[[\s\S]*\]/); // JSON 파싱 실패 시 배열만이라도 회수 시도
    if (m) { try { names = JSON.parse(m[0]); } catch {} }
  }
  return Array.isArray(names) ? names : [];
}

// 동시 append 충돌 방지용 간단 직렬화 락(단일 프로세스 내 워커 여러 개가 같은 파일에 씀).
let cpLock = Promise.resolve();
function appendLine(path, line) {
  cpLock = cpLock.then(() => appendFile(path, line + "\n"));
  return cpLock;
}

async function loadCheckpoint() {
  try {
    const txt = await readFile(CHECKPOINT, "utf8");
    return new Set(txt.split("\n").map((s) => s.trim()).filter(Boolean).map(Number));
  } catch {
    return new Set(); // 파일 없으면 처음 실행
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const done = await loadCheckpoint();
  console.log(`체크포인트 로드: 완료 ${done.size}건`);

  let targets = [];
  for (const y of YEARS) {
    const sql = `SELECT idxno, body FROM archive_articles WHERE year=${Number(y)} AND body IS NOT NULL AND trim(body)<>'' ORDER BY idxno`;
    const r = await d1(sql);
    const rows = r?.[0]?.results ?? [];
    console.log(`연도 ${y}: ${rows.length}건 조회`);
    targets.push(...rows);
  }
  targets = targets.filter((a) => !done.has(Number(a.idxno)));
  if (LIMIT) targets = targets.slice(0, LIMIT);
  console.log(`추출 대상 ${targets.length}건 (동시 ${CONC} · 모델 ${GEMINI_MODEL})`);
  if (!targets.length) { console.log("처리할 기사가 없습니다."); return; }

  let ok = 0, fail = 0, doneCount = 0;
  const failures = [];

  async function handle(row) {
    const idxno = Number(row.idxno);
    const body = String(row.body || "");
    try {
      const raw = await gemini(body);
      const names = faithfulFilter(raw, body); // 본문에 실제 없는 이름 제거(지어내기 방지)
      await appendLine(JSONL, JSON.stringify({ idxno, names }));
      await appendLine(CHECKPOINT, String(idxno)); // 성공한 것만 체크포인트에 기록(실패는 다음 실행에서 재시도)
      ok++;
      process.stdout.write(".");
    } catch (e) {
      fail++;
      failures.push(`${idxno}\t${e?.message || e}`);
      process.stdout.write("x");
      console.error(`\n기사 ${idxno} 추출 실패(스킵·계속):`, e?.message || e);
    } finally {
      if (++doneCount % 50 === 0) process.stdout.write(` ${doneCount}/${targets.length}\n`);
    }
  }

  // 워커: 한 기사에서 예기치 못한 예외가 나도 전체 런이 죽지 않게 보호.
  let qi = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(CONC, targets.length)) }, async () => {
      while (qi < targets.length) {
        const row = targets[qi++];
        try {
          await handle(row);
        } catch (e) {
          fail++;
          const idxno = Number(row.idxno);
          failures.push(`${idxno}\t${e?.message || e}`);
          console.error("\n기사 처리 예외(스킵·계속):", e?.message || e);
        }
      }
    })
  );

  if (failures.length) await appendFile(FAILLOG, failures.join("\n") + "\n");

  console.log(`\n\n=== 추출 완료 === 성공 ${ok} · 실패 ${fail} (전체 ${targets.length})`);
  console.log(`결과: ${JSONL}\n체크포인트: ${CHECKPOINT}`);
  if (failures.length) console.log(`실패 목록(다음 실행 시 자동 재시도): ${FAILLOG}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
