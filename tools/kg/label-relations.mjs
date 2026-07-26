#!/usr/bin/env node
// tools/kg/label-relations.mjs — KG 5단계 v1: 강한 공동등장(coappears, weight≥10) 엣지에 관계 종류 라벨링.
//   대상: kg_edges(rel='coappears', weight>=10, reltype 미설정) → attrs.articles(대표 idxno)의 기사 제목
//   + 두 인물 이름(kg_nodes)을 Gemini(Flash-Lite, thinkingBudget:0)에 주어 관계 종류를 분류
//   → normalizeReltype으로 어휘 강제 → attrs_json에 reltype/relreason 병합 → UPDATE(INSERT 아님,
//   weight/articles/verified 등 기존 값 보존). 대상 쿼리가 reltype IS NULL만 골라 이미 라벨된 엣지는
//   재실행 시 자동 스킵 — 체크포인트 파일 없이도 중단 후 이어하기 안전.
// 사용: export GEMINI_API_KEY=...
//       node label-relations.mjs [--limit N] [--conc 4] [--dry]
//   --dry: Gemini 분류만 수행하고 결과를 로그로만 남김(UPDATE 생략).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeReltype } from "./label-lib.mjs";

const exec = promisify(execFile);

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

function arg(n, d) { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : d; }
const LIMIT = Math.max(0, Number(arg("--limit", "0")) || 0);
const CONC = Math.max(1, Number(arg("--conc", "4")) || 4);
const DRY = process.argv.includes("--dry");

if (!GEMINI_KEY) { console.error("GEMINI_API_KEY 필요"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 일시오류 판정 — tools/kg/extract-persons.mjs · merge-candidates.mjs와 동일 정규식.
const TRANSIENT = /7500|InternalError|internal error|fetch failed|429|5\d\d|Network/i;

// D1 조회/적용 공통 헬퍼 — wrangler d1 execute --command --json (extract-persons.mjs의 d1() 패턴 재사용).
// 이 스크립트는 대량 배치 파일이 필요 없는 규모(대상 엣지 수천 건)라 SELECT/UPDATE 모두 --command로
// 실행하고, apply-kg.mjs/merge-candidates.mjs의 d1file()과 동일한 지수 백오프 재시도를 적용한다.
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

function sqlEscape(s) { return String(s).replace(/'/g, "''"); }

function prompt(nameA, nameB, titles) {
  return `다음 두 인물이 함께 나온 기사 제목들을 보고 두 사람의 관계를 아래 어휘 중 하나로 분류하라.
- 반드시 다음 중 하나만: 협력·동료, 대립·갈등, 소속·상하, 전임·후임, 가족·인척, 기타
- 제목에 드러난 내용만 근거로 판단하라(추측·배경지식 금지). 근거가 불명확하면 "기타"로 답하라.
- 출력은 다른 설명 없이 JSON만: {"reltype":"...","reason":"한 문장 근거"}

인물 A: ${nameA}
인물 B: ${nameB}
함께 등장한 기사 제목:
${titles.map((t) => `- ${t}`).join("\n")}`;
}

// Gemini generateContent 호출 — tools/ebook/restructure-gemini.mjs의 gemini() 헬퍼 패턴 재사용
// (thinkingBudget:0, responseMimeType json 필수). 429/5xx·네트워크 예외 모두 지수 백오프 재시도.
async function gemini(nameA, nameB, titles, tries = 5) {
  let res, lastErr;
  const text = prompt(nameA, nameB, titles);
  for (let t = 1; t <= tries; t++) {
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(120_000),
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 512,
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
  let parsed = {};
  try { parsed = JSON.parse(out); }
  catch {
    const m = out.match(/\{[\s\S]*\}/); // JSON 파싱 실패 시 객체만이라도 회수 시도
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  return {
    reltype: parsed?.reltype,
    reason: typeof parsed?.reason === "string" ? parsed.reason.slice(0, 300) : "",
  };
}

// IN(...) 절 배치 조회 공통 — 항목 수가 많아도 wrangler 커맨드 하나에 다 담지 않고 청크 단위로 나눈다.
async function batchedIn(items, chunkSize, buildSql, onRow) {
  const arr = [...items];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const r = await d1(buildSql(chunk));
    for (const row of r?.[0]?.results ?? []) onRow(row);
  }
}

async function main() {
  console.log(`대상 조회 중... (모델 ${GEMINI_MODEL} · 동시 ${CONC}${DRY ? " · --dry" : ""})`);

  // 대상: rel='coappears' · weight>=10 · reltype 미설정만 — 이미 라벨된 엣지는 여기서 제외되므로
  // 재실행해도 중복 작업 없이 이어서 진행된다(별도 체크포인트 파일 불필요).
  let sql =
    "SELECT id, src_id, dst_id, attrs_json FROM kg_edges WHERE rel='coappears' " +
    "AND CAST(json_extract(attrs_json,'$.weight') AS INT)>=10 " +
    "AND json_extract(attrs_json,'$.reltype') IS NULL";
  if (LIMIT) sql += ` LIMIT ${LIMIT}`;
  const result = await d1(sql);
  const rows = result?.[0]?.results ?? [];
  console.log(`대상 엣지 ${rows.length}건`);
  if (!rows.length) { console.log("라벨링할 엣지가 없습니다."); return; }

  // 엣지가 참조하는 인물 노드 id·기사 idxno를 모아 이름/제목을 한 번에(청크 단위) 조회 — 엣지마다
  // 조회하면 호출 수가 폭증하므로 여기서 캐시를 만들어 둔다.
  const nodeIds = new Set();
  const idxnos = new Set();
  const edges = [];
  for (const row of rows) {
    let attrs;
    try { attrs = JSON.parse(row.attrs_json || "{}"); } catch { attrs = {}; }
    const articles = Array.isArray(attrs.articles)
      ? attrs.articles.map(Number).filter((n) => Number.isFinite(n))
      : [];
    edges.push({ id: row.id, src_id: row.src_id, dst_id: row.dst_id, attrs, articles });
    nodeIds.add(row.src_id);
    nodeIds.add(row.dst_id);
    for (const a of articles) idxnos.add(a);
  }

  console.log(`인물 이름 조회 중... (노드 ${nodeIds.size}개)`);
  const nameById = new Map();
  await batchedIn(
    nodeIds,
    500,
    (chunk) => `SELECT id, name FROM kg_nodes WHERE id IN (${chunk.map((id) => `'${sqlEscape(id)}'`).join(",")})`,
    (row) => nameById.set(row.id, row.name)
  );

  console.log(`기사 제목 조회 중... (기사 ${idxnos.size}건)`);
  const titleByIdxno = new Map();
  await batchedIn(
    idxnos,
    800,
    (chunk) => `SELECT idxno, title FROM archive_articles WHERE idxno IN (${chunk.join(",")})`,
    (row) => titleByIdxno.set(Number(row.idxno), row.title)
  );

  let ok = 0, noEvidence = 0, failed = 0, done = 0;

  async function handle(edge) {
    try {
      const nameA = nameById.get(edge.src_id) || edge.src_id;
      const nameB = nameById.get(edge.dst_id) || edge.dst_id;
      const titles = edge.articles.map((a) => titleByIdxno.get(a)).filter(Boolean);

      let reltype, reason;
      if (!titles.length) {
        // 대표 기사 제목을 하나도 못 찾으면(삭제·재구조화 등) Gemini에 줄 근거가 없음 → 기타로
        // 확정 저장(Gemini 호출 생략 — 비용 절감, 반복 재시도도 방지).
        reltype = normalizeReltype(undefined);
        reason = "대표 기사 제목을 찾을 수 없어 근거 없음";
        noEvidence++;
      } else {
        const g = await gemini(nameA, nameB, titles);
        reltype = normalizeReltype(g.reltype); // 순수 로직 재사용 — 여기서 재구현하지 않음
        reason = g.reason;
        ok++;
      }

      if (DRY) {
        console.log(`[dry] ${nameA} · ${nameB} → ${reltype}${reason ? ` (${reason})` : ""}`);
        return;
      }

      // 기존 attrs_json(weight/articles 등)을 보존하고 reltype/relreason만 병합 — INSERT가 아닌 UPDATE라
      // verified·created_at 등 다른 컬럼은 전혀 손대지 않는다.
      const attrsJson = JSON.stringify({ ...edge.attrs, reltype, relreason: reason });
      const now = new Date().toISOString();
      const updateSql =
        `UPDATE kg_edges SET attrs_json='${sqlEscape(attrsJson)}', updated_at='${sqlEscape(now)}' WHERE id='${sqlEscape(edge.id)}';`;
      await d1(updateSql);
      process.stdout.write(".");
    } catch (e) {
      failed++;
      process.stdout.write("x");
      console.error(`\n엣지 실패(격리·계속): ${edge.id} — ${e?.message || e}`);
    } finally {
      if (++done % 50 === 0) process.stdout.write(` ${done}/${edges.length}\n`);
    }
  }

  let idx = 0;
  async function worker() { while (idx < edges.length) { await handle(edges[idx++]); } }
  await Promise.all(Array.from({ length: Math.min(CONC, edges.length) }, worker));

  console.log(
    `\n완료: 분류 ${ok}건 · 근거없음(기타 확정) ${noEvidence}건 · 실패 ${failed}건 (전체 ${edges.length}건)` +
    (DRY ? " — --dry: UPDATE 생략" : "")
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
