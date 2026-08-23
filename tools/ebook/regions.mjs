// 지면에서 기사가 차지한 자리 찾기 — 원본 스캔 위에 '지금 읽는 기사'를 짚어주기 위한 좌표를 만든다.
//
//   왜: 한 지면에 기사가 여섯~여덟 개씩 실린다. 스캔을 펼쳐도 어느 것이 이 기사인지 알 수 없다.
//   어떻게: 지면을 다시 글자인식(Vision)해 **문단 상자**를 얻고, 그 글이 어느 기사 본문에
//           들어 있는지 맞춰 본다. 문단마다 따로 담는다(통짜 사각형은 남의 기사까지 덮는다).
//
//   비용: 지면 7,343장 × Vision DOCUMENT_TEXT_DETECTION ≈ $11 (1,000장당 $1.5, 월 1,000장 무료).
//   쓰기: 결과는 SQL 파일로만 낸다. D1 적재는 사람이 확인한 뒤 따로 실행한다.
//
//   사용:
//     export GOOGLE_VISION_API_KEY=...
//     node tools/ebook/regions.mjs                 # 전체(이어하기)
//     node tools/ebook/regions.mjs --year 1997     # 한 해만
//     node tools/ebook/regions.mjs --limit 5       # 맛보기
//   적재:
//     npx wrangler d1 execute taean-archive --remote --file db/migrations/053_ebook_regions.sql
//     npx wrangler d1 execute taean-archive --remote --file tools/ebook/out/ebook-regions.sql

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { visionParagraphs, assignPage } from "./region-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "out");
const SQL_OUT = join(OUT_DIR, "ebook-regions.sql");
const CKPT = join(OUT_DIR, "regions-progress.json");   // 지면 키 → 완료 표시(이어하기)
const LOG = join(OUT_DIR, "regions.log");

const KEY = process.env.GOOGLE_VISION_API_KEY;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const YEAR = arg("--year", null);
const LIMIT = Number(arg("--limit", 0)) || 0;
const CONC = Number(arg("--conc", 4)) || 4;
/** 본문을 이만큼도 못 찾았으면 좌표를 남기지 않는다 — 엉뚱한 자리를 칠하느니 안 칠하는 게 낫다. */
const MIN_MATCHED = Number(arg("--min", 0.25));

if (!KEY) { console.error("GOOGLE_VISION_API_KEY 가 없습니다. export 하고 다시 실행하세요."); process.exit(1); }
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const log = (m) => { console.log(m); appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sqlStr = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;

// ── D1에서 전자북 기사 읽기 ────────────────────────────────────────────────
//   wrangler를 프로세스로 부른다(다른 tools/kg 스크립트와 같은 방식).
function d1(sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "taean-archive", "--remote", "--json", "--command", sql],
    { cwd: join(HERE, "../../backend"), encoding: "utf-8", maxBuffer: 512 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results ?? [];
}

// ── Vision ────────────────────────────────────────────────────────────────
async function vision(imageUrl) {
  const img = await fetchRetry(imageUrl);
  const content = Buffer.from(await img.arrayBuffer()).toString("base64");
  const res = await fetchRetry("https://vision.googleapis.com/v1/images:annotate?key=" + KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requests: [{ image: { content }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: ["ko"] } }],
    }),
  });
  const j = await res.json();
  const r = (j.responses || [])[0] || {};
  if (r.error) throw new Error(`Vision: ${r.error.message}`);
  return r.fullTextAnnotation || null;
}

/** 키가 틀렸으면 7,343장을 다 태우기 전에 멈춘다 — 한 번 겪었다(자리표시자를 그대로 붙였다). */
function fatalIfBadKey(msg) {
  if (!/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|API key expired/i.test(String(msg))) return;
  console.error("\n키가 유효하지 않습니다. GOOGLE_VISION_API_KEY 를 확인하고 다시 실행하세요.");
  console.error("(체크포인트에 성공한 지면만 적혀 있어, 다시 돌리면 실패분부터 이어갑니다.)");
  process.exit(1);
}

/** 네트워크·서버 일시오류는 지수 백오프로 다시 시도한다. */
async function fetchRetry(url, opts = {}, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) {
        const t = (await res.text()).replace(/\s+/g, " ");
        throw new Error(`${res.status} ${t.slice(0, 160)}`);
      }
      last = new Error(`${res.status}`);
    } catch (e) { last = e; }
    await sleep(800 * 2 ** i);
  }
  throw last;
}

// ── 본체 ──────────────────────────────────────────────────────────────────
const ckpt = existsSync(CKPT) ? JSON.parse(readFileSync(CKPT, "utf-8")) : { done: {} };
const saveCkpt = () => writeFileSync(CKPT, JSON.stringify(ckpt));

const where = ["idxno BETWEEN 90000001 AND 90099999", "lead_image IS NOT NULL"];
if (YEAR) where.push(`year = ${Number(YEAR)}`);
log(`기사 읽는 중…${YEAR ? ` (${YEAR}년)` : ""}`);
const rows = d1(`SELECT idxno, title, body, lead_image FROM archive_articles WHERE ${where.join(" AND ")}`);

// 같은 지면 이미지를 쓰는 기사끼리 묶는다 — 지면 한 장에 Vision 한 번이면 된다.
const pages = new Map();
for (const r of rows) {
  const url = String(r.lead_image || "").split("?")[0];
  if (!url) continue;
  if (!pages.has(url)) pages.set(url, []);
  pages.get(url).push(r);
}
let keys = [...pages.keys()].filter((k) => !ckpt.done[k]).sort();
if (LIMIT) keys = keys.slice(0, LIMIT);
log(`기사 ${rows.length}건 · 지면 ${pages.size}장 · 이번에 처리할 지면 ${keys.length}장`);

let ok = 0, skipped = 0, failed = 0;
const lines = [];

async function one(url) {
  const arts = pages.get(url);
  const fta = await vision(url);
  const paras = visionParagraphs(fta);
  if (!paras.length) { skipped++; return; }
  for (const a of assignPage(paras, arts)) {
    // 조금밖에 못 찾았으면 남기지 않는다 — 엉뚱한 자리를 칠하느니 안 칠하는 게 낫다.
    if (!a.boxes.length || a.matched < MIN_MATCHED) { skipped++; continue; }
    lines.push(
      `INSERT INTO ebook_regions(idxno,boxes_json,matched,ver,created_at) VALUES (` +
      `${a.idxno},${sqlStr(JSON.stringify(a.boxes))},${a.matched},1,${sqlStr(new Date().toISOString())}) ` +
      `ON CONFLICT(idxno) DO UPDATE SET boxes_json=excluded.boxes_json, matched=excluded.matched, ver=excluded.ver;`,
    );
    ok++;
  }
}

// 몇 장씩 나눠 동시에 — 한 장이 실패해도 나머지는 계속 간다.
for (let i = 0; i < keys.length; i += CONC) {
  await Promise.all(keys.slice(i, i + CONC).map(async (url) => {
    try { await one(url); ckpt.done[url] = 1; }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fatalIfBadKey(msg);
      failed++; log(`✗ ${url.split("/").slice(-2).join("/")} — ${msg}`);
    }
  }));
  saveCkpt();
  if (lines.length) { appendFileSync(SQL_OUT, lines.splice(0).join("\n") + "\n"); }   // 중간중간 저장
  if ((i / CONC) % 10 === 0) log(`…지면 ${Math.min(i + CONC, keys.length)}/${keys.length} · 좌표 ${ok}건 · 건너뜀 ${skipped} · 실패 ${failed}`);
}

log(`\n── 요약 ──\n좌표 ${ok}건 · 건너뜀 ${skipped}건 · 실패 ${failed}장 → ${SQL_OUT}`);
log(`적재: npx wrangler d1 execute taean-archive --remote --file ${SQL_OUT}`);
