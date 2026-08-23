// 지면에서 기사가 차지한 자리 찾기 — 원본 스캔 위에 '지금 읽는 기사'를 붉게 짚어주기 위한 좌표.
//
//   왜: 한 지면에 기사가 여섯~여덟 개씩 실린다. 스캔을 펼쳐도 어느 것이 이 기사인지 알 수 없다.
//   어떻게: 지면을 **맥 내장 글자인식**(`ocr_vision`, VNRecognizeTextRequest)으로 훑어 줄 상자를
//           얻고, 그 글이 어느 기사 본문에 들어 있는지 맞춰 본다.
//
//   ⚠ 처음엔 Google Vision을 쓰려 했으나 **키도 비용도 필요 없다** — 저장소에 이미 있던
//     `ocr_vision`이 `[{t,x,y,w,h}]`를 0~1 정규화 좌표로 내준다. 온디바이스라 공짜다.
//
//   ⚠ 세로쓰기 시절(1990~1994)은 잘 안 된다. 실측(1993-12-31 1면) 본문 6%밖에 못 찾았다 —
//     지면이 세로쓰기라 글자인식 자체가 깨진다. 가로쓰기(1997 실측)는 96%였다.
//     못 찾은 지면은 좌표를 남기지 않으므로 화면에서 그냥 안 칠해진다.
//
//   자격증명이 필요 없다 — 기사·지면 목록은 공개 API로 읽고, 글자인식은 이 기계에서 한다.
//   결과는 SQL 파일로만 낸다. D1 적재는 사람이 확인한 뒤 따로 실행한다.
//
//   사용:
//     node tools/ebook/regions.mjs --limit 3          # 맛보기(지면 3장)
//     node tools/ebook/regions.mjs --year 1997        # 한 해
//     node tools/ebook/regions.mjs                    # 전체(이어하기)
//   적재:
//     npx wrangler d1 execute taean-archive --remote --file tools/ebook/out/ebook-regions.sql

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ocrLines, assignPage } from "./region-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "out");
const SQL_OUT = join(OUT_DIR, "ebook-regions.sql");
const CKPT = join(OUT_DIR, "regions-progress.json");
const LOG = join(OUT_DIR, "regions.log");
const OCR_BIN = join(HERE, "ocr_vision");
const API = process.env.TAEAN_API ?? "https://taean-insight-api.chs9182.workers.dev";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const YEAR = arg("--year", null);
const LIMIT = Number(arg("--limit", 0)) || 0;
const CONC = Number(arg("--conc", 3)) || 3;
/** 본문을 이만큼도 못 찾았으면 좌표를 남기지 않는다 — 엉뚱한 자리를 칠하느니 안 칠하는 게 낫다. */
const MIN_MATCHED = Number(arg("--min", 0.25));

if (!existsSync(OCR_BIN)) { console.error(`글자인식 도구가 없습니다: ${OCR_BIN}`); process.exit(1); }
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const log = (m) => { console.log(m); appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sqlStr = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;

/** 네트워크·서버 일시오류는 지수 백오프로 다시 시도한다. */
async function get(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) throw new Error(String(res.status));
      last = new Error(String(res.status));
    } catch (e) { last = e; }
    await sleep(600 * 2 ** i);
  }
  throw last;
}
const getJson = async (u) => (await get(u)).json();

/** 지면 한 장 글자인식 — 내려받아 임시 파일에 두고 돌린 뒤 지운다. */
async function ocrPage(imgUrl) {
  const tmp = join(tmpdir(), `taean-page-${process.pid}-${Math.random().toString(36).slice(2)}.jpg`);
  try {
    writeFileSync(tmp, Buffer.from(await (await get(imgUrl)).arrayBuffer()));
    return ocrLines(JSON.parse(execFileSync(OCR_BIN, [tmp], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 })));
  } finally {
    try { rmSync(tmp, { force: true }); } catch { /* 임시 파일 정리 실패는 무시 */ }
  }
}

// ── 대상 지면 모으기 ───────────────────────────────────────────────────────
const ckpt = existsSync(CKPT) ? JSON.parse(readFileSync(CKPT, "utf-8")) : { done: {} };
const saveCkpt = () => writeFileSync(CKPT, JSON.stringify(ckpt));

log("지면 목록 읽는 중…");
const years = YEAR ? [{ year: Number(YEAR) }] : ((await getJson(`${API}/api/archive/papers/years`)).years ?? []);
const targets = [];
for (const y of years) {
  const { issues = [] } = await getJson(`${API}/api/archive/papers/${y.year}`);
  for (const it of issues) for (const p of it.pages) targets.push({ year: y.year, date: it.date, no: p.no });
}
let todo = targets.filter((t) => !ckpt.done[`${t.date}#${t.no}`]);
if (LIMIT) todo = todo.slice(0, LIMIT);
log(`대상 지면 ${targets.length}장 · 이번에 처리할 ${todo.length}장`);

let ok = 0, skipped = 0, failed = 0, pagesDone = 0;
const lines = [];

async function onePage(t) {
  const { articles = [] } = await getJson(`${API}/api/archive/papers/${t.year}/${t.date}/${t.no}`);
  if (!articles.length) { skipped++; return; }
  // 본문이 있어야 맞출 수 있다. 기사 상세를 하나씩 받는다(엣지 캐시라 두 번째부터는 빠르다).
  const full = [];
  for (const a of articles) {
    try {
      const r = await getJson(`${API}/api/archive/${a.idxno}`);
      full.push({ idxno: a.idxno, title: r.title ?? "", body: r.body ?? "" });
    } catch { /* 한 건 실패는 건너뛴다 */ }
  }
  if (!full.length) { skipped++; return; }

  const ymd = t.date.replace(/-/g, "");
  const paras = await ocrPage(`${API}/api/archive/photo/ebook/${ymd}/page_${String(t.no).padStart(2, "0")}.jpg`);
  if (!paras.length) { skipped++; return; }

  for (const a of assignPage(paras, full)) {
    if (!a.boxes.length || a.matched < MIN_MATCHED) { skipped++; continue; }
    lines.push(
      `INSERT INTO ebook_regions(idxno,boxes_json,matched,ver,created_at) VALUES (` +
      `${a.idxno},${sqlStr(JSON.stringify(a.boxes))},${a.matched},1,${sqlStr(new Date().toISOString())}) ` +
      `ON CONFLICT(idxno) DO UPDATE SET boxes_json=excluded.boxes_json, matched=excluded.matched, ver=excluded.ver;`,
    );
    ok++;
  }
}

// 몇 장씩 나눠 — 한 장이 실패해도 나머지는 계속 간다.
for (let i = 0; i < todo.length; i += CONC) {
  await Promise.all(todo.slice(i, i + CONC).map(async (t) => {
    try { await onePage(t); ckpt.done[`${t.date}#${t.no}`] = 1; }
    catch (e) { failed++; log(`✗ ${t.date} ${t.no}면 — ${e instanceof Error ? e.message : e}`); }
    finally { pagesDone++; }
  }));
  saveCkpt();
  if (lines.length) appendFileSync(SQL_OUT, lines.splice(0).join("\n") + "\n");
  if (pagesDone % 30 < CONC) log(`…${pagesDone}/${todo.length}장 · 좌표 ${ok}건 · 건너뜀 ${skipped} · 실패 ${failed}`);
}

log(`\n── 요약 ──\n좌표 ${ok}건 · 건너뜀 ${skipped}건 · 실패 ${failed}장 → ${SQL_OUT}`);
log(`적재: npx wrangler d1 execute taean-archive --remote --file ${SQL_OUT}`);
