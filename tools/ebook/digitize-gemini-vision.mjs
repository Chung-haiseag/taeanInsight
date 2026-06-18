#!/usr/bin/env node
// 세로쓰기(縱書) 옛 지면 전용 디지타이저 — Gemini 멀티모달이 지면 이미지를 직접 읽어
//   ① 전사(세로조판·한자혼용 인식) + ② 기사 분리 를 한 번에. (OCR·Claude 미사용)
//   ※ 일반 가로조판은 digitize-ocr.mjs(Vision OCR=진실원천) 사용 — 이건 OCR이 깨지는 1990용.
//
// 사용:
//   export GEMINI_API_KEY=...
//   node digitize-gemini-vision.mjs --dir "/Users/nctoo/Downloads/.../과거신문/1990" [--limit N] [--conc 3]
//   → out/ebook_articles.jsonl 누적(이어하기) + R2 ebook/<날짜>/page_NN.jpg 업로드
//   적재: node publish.mjs --skip-spacing
//
// 의존: pdftoppm, sips(Mac), wrangler(R2). Node 20+.
import { readdir, mkdir, appendFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "out");
const OUT_JSONL = join(OUT_DIR, "ebook_articles.jsonl");
const OUT_REVIEW = join(OUT_DIR, "ebook_needs_review.txt");
const TMP = join(OUT_DIR, "tmp_gv");
const R2_BUCKET = "taean-archive-photos";
const PHOTO_BASE = "https://taean-insight-api.chs9182.workers.dev/api/archive/photo";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const THINK = Number(process.env.GEMINI_THINKING || "0");   // 기본 0(끔). 어려우면 올려 시도.
const RENDER_DPI = Number(process.env.RENDER_DPI || "300");
const CATS = ["tourism", "environment", "realestate", "policy", "industry", "culture", "society"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function arg(n, d) { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : d; }
async function sh(cmd, args) { return exec(cmd, args, { maxBuffer: 96 * 1024 * 1024 }); }

const PROMPT = `이 이미지는 1990년 한국 지역신문(태안신문) 지면입니다. 본문은 대체로 **세로쓰기(縱書, 위→아래, 칼럼은 오른쪽→왼쪽)**이고 한글·한자가 섞여 있습니다.
지면을 읽어 기사들을 구분해 JSON 배열로만 출력하세요(설명 없이 JSON만).
- 지면의 글자를 **정확히 전사**하라 — 요약·재작성·창작 금지. 한자는 원문 그대로 보존(예: 泰安, 郡守).
- 세로로 읽어 자연스러운 가로 문장으로 옮기되, **한국어 맞춤법에 맞게 띄어쓰기**하라.
- 판독 불가 글자는 □ 로 표기(추측해서 지어내지 마라).
- 제호(신문 머리글)·발행정보·판권·목차는 제외.
- 광고/홍보(상품광고·축하광고·분양·전화문의·시세표 등)는 "isAd": true 로 표시.
- 본문이 거의 없는 표·명단·공고 지면이면 빈 배열 [] 을 출력.
각 기사: {"title": "제목", "body": "본문", "category": "${CATS.join("|")}", "isAd": true/false}`;

// flash가 비결정적으로 출력 무한반복(루프→MAX_TOKENS)에 빠짐. 단일 설정은 100% 안전치 않으므로
// 절단되면 thinking·temperature를 바꿔 재시도(각 시도는 독립적이라 실패율 급감). 정상면은 토큰 적게 씀.
const MAXTOK = Number(process.env.GEMINI_MAXTOK || "8192");
const FLASH = process.env.GEMINI_MODEL || "gemini-2.5-flash";
// 충실도 우선: flash 단독(상위 pro는 요약·중복·환각 위험이라 미사용 — 역사 아카이브 신뢰성).
// flash가 비결정적으로 루프(MAX_TOKENS)/반복에 빠지므로 설정 다양화로 여러 번 시도.
// 다 실패하면 정직하게 스텁(원본 지면 이미지 열람 가능) — 지어내기보다 낫다.
const FLASH_ATTEMPTS = [
  { think: 0, temp: 0.1 }, { think: 1024, temp: 0.4 }, { think: 0, temp: 0.6 },
  { think: 2048, temp: 0.7 }, { think: 1024, temp: 0.9 }, { think: 512, temp: 0.3 },
  { think: 4096, temp: 0.5 }, { think: 0, temp: 1.0 },
];

// 본문에 동일 구절이 과다 반복되면(루프 잔재) 불량 처리. 정상문은 반복률 낮음.
function isRepetitive(arts) {
  for (const a of arts || []) {
    const s = String(a?.body || "").replace(/\s+/g, "");
    if (s.length < 60) continue;
    const grams = new Map();
    for (let i = 0; i + 12 <= s.length; i += 6) { const g = s.slice(i, i + 12); grams.set(g, (grams.get(g) || 0) + 1); }
    let max = 0; for (const v of grams.values()) if (v > max) max = v;
    if (max >= 4) return true;          // 같은 12글자가 4번+ → 루프 잔재
  }
  return false;
}

async function oneCall(b64, model, { think, temp, max }, httpTries = 4) {
  let res;
  for (let t = 1; t <= httpTries; t++) {
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`, {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(300_000),
        body: JSON.stringify({
          contents: [{ parts: [{ inlineData: { mimeType: "image/jpeg", data: b64 } }, { text: PROMPT }] }],
          generationConfig: { temperature: temp, maxOutputTokens: max || MAXTOK, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: think } },
        }),
      });
    } catch (e) { if (t < httpTries) { await sleep(2000 * t * t); continue; } throw e; }
    if (res.status === 429 || res.status >= 500) { if (t < httpTries) { await sleep(2000 * t * t); continue; } }
    break;
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json(); const c = j.candidates?.[0];
  const out = (c?.content?.parts || []).map((p) => p.text || "").join("");
  const u = j.usageMetadata || {};
  let arts = [];
  try { const p = JSON.parse(out); arts = Array.isArray(p) ? p : p.articles || []; }
  catch { const m = out.match(/\[[\s\S]*\]/); if (m) try { arts = JSON.parse(m[0]); } catch {} }
  arts = Array.isArray(arts) ? arts : [];
  const bad = c?.finishReason === "MAX_TOKENS" || isRepetitive(arts);
  return { arts, inTok: u.promptTokenCount || 0, outTok: u.candidatesTokenCount || 0, truncated: bad, model };
}

// flash 다회 시도(설정 다양화). 절단·반복이면 다음 설정으로 재시도. 다 실패하면 truncated=true(→스텁).
async function gemini(b64) {
  let inTok = 0, outTok = 0, last = null;
  for (const cfg of FLASH_ATTEMPTS) {
    const r = await oneCall(b64, FLASH, cfg); inTok += r.inTok; outTok += r.outTok; last = r;
    if (!r.truncated) return { ...r, inTok, outTok };
  }
  return { ...last, inTok, outTok, truncated: true };
}

async function main() {
  if (!GEMINI_KEY) { console.error("GEMINI_API_KEY 필요"); process.exit(1); }
  const dir = arg("--dir");
  if (!dir) { console.error("--dir <경로> 필요"); process.exit(1); }
  const limit = Number(arg("--limit", "0"));
  const CONC = Number(arg("--conc", "3"));
  const onlyDate = arg("--date");   // 특정 호만(YYYYMMDD)
  await mkdir(TMP, { recursive: true });

  // 날짜 폴더 탐색 (<dir>/<YYYYMMDD>/ 또는 <dir>/<YYYY>/<YYYYMMDD>/)
  const dateDirs = [];
  for (const d of (await readdir(dir)).sort()) {
    if (/^\d{8}$/.test(d)) dateDirs.push({ date: d, dirPath: join(dir, d) });
    else if (/^\d{4}$/.test(d)) for (const dd of (await readdir(join(dir, d)).catch(() => [])).sort())
      if (/^\d{8}$/.test(dd)) dateDirs.push({ date: dd, dirPath: join(dir, d, dd) });
  }
  dateDirs.sort((a, b) => a.date.localeCompare(b.date));
  let pages = [];
  for (const { date: d, dirPath } of dateDirs) {
    const files = (await readdir(dirPath)).filter((f) => /^TA_\d{8}_\d+\.pdf$/i.test(f)).sort();
    for (const f of files) pages.push({ date: d, page: (f.match(/_(\d+)\.pdf$/i) || [])[1], path: join(dirPath, f) });
  }
  // 이어하기: 이미 처리한 date_page 스킵 + nextIdx
  const done = new Set(); let nextIdx = 90000001;
  if (existsSync(OUT_JSONL)) for (const line of (await readFile(OUT_JSONL, "utf8")).split("\n")) {
    if (!line.trim()) continue; try { const a = JSON.parse(line); done.add(`${a.date}_${a.page}`); nextIdx = Math.max(nextIdx, a.idxno + 1); } catch {}
  }
  let cand = pages.filter((p) => !done.has(`${p.date}_${p.page}`));
  if (onlyDate) cand = cand.filter((p) => p.date === onlyDate);
  const todo = cand.slice(0, limit || undefined);
  console.log(`대상 ${todo.length}p (전체 ${pages.length}, 완료스킵 ${pages.length - cand.length}${onlyDate ? `, --date ${onlyDate}` : ""}) · 모델 ${GEMINI_MODEL} · thinking ${THINK} · 동시 ${CONC}`);
  if (todo.length) console.log(`처리 예정 샘플: ${todo.slice(0, 4).map((p) => p.date + "_" + p.page).join(", ")}${todo.length > 4 ? " …" : ""}`);
  if (!todo.length) { console.log("처리할 면 없음."); return; }

  let inTok = 0, outTok = 0, nArt = 0, nDrop = 0, nStub = 0, nFail = 0, done2 = 0;
  const writeRec = async (r) => { r.idxno = nextIdx++; await appendFile(OUT_JSONL, JSON.stringify(r) + "\n"); nArt++; };

  async function handle(pg) {
    const { date, page, path } = pg;
    const prefix = join(TMP, `${date}_${page}`);
    await sh("pdftoppm", ["-png", "-r", String(RENDER_DPI), "-singlefile", path, prefix]);
    const full = `${prefix}.png`;
    // 지면 이미지 R2 업로드 (목록 썸네일 + 원본 지면 보기) — digitize-ocr와 동일 규격
    const pageJpg = `${prefix}_page.jpg`;
    await sh("sips", ["-Z", "1600", "-s", "format", "jpeg", "-s", "formatOptions", "80", full, "--out", pageJpg]);
    await sh("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/ebook/${date}/page_${page}.jpg`, "--file", pageJpg, "--content-type", "image/jpeg", "--remote"]);
    const pageFull = `${prefix}_pagefull.jpg`;
    await sh("sips", ["--resampleWidth", "1800", "-s", "format", "jpeg", "-s", "formatOptions", "82", full, "--out", pageFull]);
    await sh("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/ebook/${date}/page_${page}full.jpg`, "--file", pageFull, "--content-type", "image/jpeg", "--remote"]);
    // Gemini 입력용 고해상 JPEG (세로 잔글씨 판독 위해 폭 2400)
    const gvJpg = `${prefix}_gv.jpg`;
    await sh("sips", ["--resampleWidth", "2400", "-s", "format", "jpeg", "-s", "formatOptions", "88", full, "--out", gvJpg]);
    const b64 = (await readFile(gvJpg)).toString("base64");

    const { arts, inTok: it, outTok: ot, truncated } = await gemini(b64);
    inTok += it; outTok += ot;

    const leadImage = `${PHOTO_BASE}/ebook/${date}/page_${page}.jpg`;
    const baseRec = (title, body, category = "society") => ({
      date, page, title,
      publishedAt: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00+09:00`,
      year: Number(date.slice(0, 4)), section: `지면 ${page}면`,
      category, author: null, membersOnly: false, ocrEngine: "gemini_vision",
      faithfulness: 1, bodyChars: body.length, excerpt: body.replace(/\s+/g, " ").slice(0, 158) + "…",
      body, images: [], leadImage, url: null,
    });

    const good = arts.filter((a) => a?.title && a?.body && String(a.body).length >= 10);
    if (!good.length || truncated) {
      // 본문 없는 표·명단 지면 또는 절단 → 스텁 1건 + 검수표시
      await writeRec(baseRec(
        `[지면 자료] ${date.slice(0, 4)}.${Number(date.slice(4, 6))}.${Number(date.slice(6, 8))} ${page}면 (표·공고 등)`,
        "이 지면은 표·명단·공고 형식이거나 자동 전사가 불안정합니다. 아래 '원본 지면 보기'에서 확인하세요.", "society"));
      await appendFile(OUT_REVIEW, `${date}_${page}\tgemini-vision ${truncated ? "절단" : "본문없음"} → 스텁\n`);
      nStub++;
      return;
    }
    for (const a of good) {
      if (a.isAd === true) { nDrop++; continue; }
      const cat = CATS.includes(a.category) ? a.category : "society";
      await writeRec(baseRec(String(a.title), String(a.body), cat));
    }
    // gemini-vision 전사는 원문 대조 가드가 없으므로 검수 권장 표시(면 단위 1줄)
    await appendFile(OUT_REVIEW, `${date}_${page}\tgemini-vision 전사(검수권장) 기사 ${good.length - good.filter(a=>a.isAd===true).length}\n`);
  }

  // 동시성 CONC 로 처리, 단일 면 실패 격리
  let idx = 0;
  async function worker() {
    while (idx < todo.length) {
      const my = idx++; const pg = todo[my];
      try { await handle(pg); } catch (e) { nFail++; await appendFile(OUT_REVIEW, `${pg.date}_${pg.page}\t실패: ${e.message?.slice(0,80)}\n`).catch(()=>{}); process.stdout.write("x"); }
      done2++;
      process.stdout.write(`\r[${done2}/${todo.length}] ${pg.date} ${pg.page}면 · 기사 ${nArt} · 스텁 ${nStub} · 광고 ${nDrop} · 실패 ${nFail}      `);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, CONC) }, worker));

  const cost = (inTok / 1e6) * 0.30 + (outTok / 1e6) * 2.50; // gemini-2.5-flash 대략 단가
  console.log(`\n\n=== 완료 ===`);
  console.log(`기사 ${nArt} · 스텁 ${nStub} · 광고제외 ${nDrop} · 실패 ${nFail}`);
  console.log(`Gemini in ${inTok}/out ${outTok} ≈ $${cost.toFixed(4)}`);
  console.log(`출력: ${OUT_JSONL}  ·  검수: ${OUT_REVIEW}`);
  console.log(`다음: node publish.mjs --skip-spacing`);
}
main().catch((e) => { console.error(e); process.exit(1); });
