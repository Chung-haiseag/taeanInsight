#!/usr/bin/env node
// 지면 PDF → ① Haiku "컬럼 타일링" OCR(좁은 컬럼 조각별 전사 → 병합, 충실)
//            → ② Haiku 구조화(전사 금지, 분리만) → ③ 충실도 가드 → ④ 사진 크롭 → JSONL
// 핵심: 전체지면 한 장은 빽빽해 Haiku가 환각한다. 컬럼 단위 좁은 조각은 단순해서
//       Haiku가 글자를 정확히 읽는다(전용 OCR 대용). 조각 텍스트를 모아 "진실 원천"으로 삼고,
//       구조화 LLM은 그 정확한 텍스트를 기사로 분리만 한다(전사 X → 사실 환각 불가).
//
// 사용:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   node digitize-tile.mjs --dir /tmp/ebook_c2 --limit 1
//   환경: HAIKU_TILE_COLS(컬럼수, 기본 5) · ANTHROPIC_MODEL(기본 Haiku) · RENDER_DPI(기본 300)
//
// 의존: pdftoppm, sips (Mac), wrangler(R2). Node 20+.

import { readdir, mkdir, appendFile, readFile } from "node:fs/promises";
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
const TMP = join(OUT_DIR, "tmp");
const R2_BUCKET = "taean-archive-photos";
const PHOTO_BASE = "https://taean-insight-api.chs9182.workers.dev/api/archive/photo";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const PRICE_IN = Number(process.env.PRICE_IN || "1.0");
const PRICE_OUT = Number(process.env.PRICE_OUT || "5.0");
const RENDER_DPI = Number(process.env.RENDER_DPI || "300");
const TILE_COLS = Number(process.env.HAIKU_TILE_COLS || "5"); // 지면 컬럼 수에 맞춰 조정
const TILE_OVERLAP = Number(process.env.HAIKU_TILE_OVERLAP || "0.02"); // 경계 클리핑 방지

const CATS = ["tourism", "environment", "realestate", "policy", "industry", "culture", "society"];
function arg(name, def) { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : def; }
async function sh(cmd, args) { return exec(cmd, args, { maxBuffer: 96 * 1024 * 1024 }); }

async function anthropic(content, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { text: (j.content || []).map((c) => c.text || "").join(""), usage: j.usage || { input_tokens: 0, output_tokens: 0 }, stop: j.stop_reason };
}
async function imgBlock(jpgPath) {
  const data = (await readFile(jpgPath)).toString("base64");
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data } };
}

// ── ① Haiku 컬럼 타일링 OCR — 좁은 컬럼 조각을 순수 전사 ─────────────────────
const STRIP_PROMPT = `이 이미지는 한국 지역신문의 "세로 컬럼 조각"입니다.
보이는 한국어 글자를 위에서 아래로 "있는 그대로" 전사하세요.
규칙: 설명·요약·해석 없이 본문 텍스트만 출력. 맞춤법을 임의로 바꾸지 말 것.
판독 불가한 글자는 □로 표기. 사진/광고 영역의 글자는 무시.`;

async function tileOCR(pdfPath, prefix, fw, fh) {
  let text = "", inTok = 0, outTok = 0;
  for (let c = 0; c < TILE_COLS; c++) {
    const x0 = Math.max(0, Math.floor((c / TILE_COLS - TILE_OVERLAP) * fw));
    const x1 = Math.min(fw, Math.ceil(((c + 1) / TILE_COLS + TILE_OVERLAP) * fw));
    const W = x1 - x0;
    if (W < 40) continue;
    const stripPng = `${prefix}_col${c}.png`, stripJpg = `${prefix}_col${c}.jpg`;
    await sh("pdftoppm", ["-png", "-r", String(RENDER_DPI), "-singlefile", "-x", String(x0), "-y", "0", "-W", String(W), "-H", String(fh), pdfPath, `${prefix}_col${c}`]);
    // 좁고 긴 조각: 긴 변 2000으로 — 활자 선명 유지
    await sh("sips", ["-Z", "2000", "-s", "format", "jpeg", "-s", "formatOptions", "90", stripPng, "--out", stripJpg]);
    const { text: t, usage } = await anthropic([await imgBlock(stripJpg), { type: "text", text: STRIP_PROMPT }], 4096);
    inTok += usage.input_tokens; outTok += usage.output_tokens;
    text += `\n[컬럼 ${c + 1}]\n` + t.trim() + "\n";
  }
  return { text: text.trim(), usage: { input_tokens: inTok, output_tokens: outTok } };
}

// ── ② 구조화: 이미지 + 정확한 OCR 텍스트 → 기사 분리(전사 금지) + 사진 박스 ──
function structurePrompt(ocrText) {
  return `아래 [OCR]는 이 신문 지면을 컬럼 단위로 정확히 전사한 텍스트입니다(컬럼 순서대로 나열됨).
이미지를 참고하여 기사들을 구분해 JSON 배열로만 출력하세요(설명·코드펜스 없이 JSON만).
절대 규칙(충실 전사):
- body는 [OCR] 텍스트의 글자를 그대로 사용. 맞춤법·표현 수정·요약·재작성 금지.
- 허용: (a) 어느 컬럼/단락이 어느 기사에 속하는지 분류·재배열, (b) 단락 구분(\\n\\n), (c) 컬럼 경계로 끊긴 문장 잇기, (d) [컬럼 N] 표시 제거.
- [OCR]에 없는 내용 추가 금지. 광고·목차·제호·판권 제외.
각 기사: {"title","body","category"(후보: ${CATS.join(", ")}),"photo":{x,y,w,h 0~1}|null}
- title은 지면 큰 제목. photo는 이미지 비율 좌표, 없으면 null.
[OCR]
${ocrText}`;
}
async function structure(apiJpg, ocrText) {
  const { text, usage, stop } = await anthropic([await imgBlock(apiJpg), { type: "text", text: structurePrompt(ocrText) }], 8192);
  const m = text.match(/\[[\s\S]*\]/);
  let articles = [], parseFailed = false;
  try { articles = JSON.parse(m ? m[0] : text); } catch { parseFailed = true; }
  return { articles: Array.isArray(articles) ? articles : [], usage, truncated: stop === "max_tokens", parseFailed };
}

// ── ③ 충실도 가드 (body가 OCR에서 유래했는지 4-gram 겹침) ──────────────────
function ngrams(s, n = 4) { const o = new Set(); for (let i = 0; i + n <= s.length; i++) o.add(s.slice(i, i + n)); return o; }
function normH(s) { return (s || "").replace(/[^가-힣0-9A-Za-z]/g, ""); }
function faithfulness(body, ocrText) {
  const b = normH(body); if (b.length < 8) return 1;
  const og = ngrams(normH(ocrText)), bg = ngrams(b);
  if (bg.size === 0) return 1;
  let hit = 0; for (const g of bg) if (og.has(g)) hit++;
  return hit / bg.size;
}

async function main() {
  const dir = arg("--dir");
  if (!dir) { console.error("--dir <경로> 필요"); process.exit(1); }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY 필요"); process.exit(1); }
  const limit = Number(arg("--limit", "0"));
  const minFaith = Number(arg("--min-faith", "0.8"));
  await mkdir(TMP, { recursive: true });

  const dates = (await readdir(dir)).filter((d) => /^\d{8}$/.test(d)).sort();
  let pages = [];
  for (const d of dates) {
    const files = (await readdir(join(dir, d))).filter((f) => /^TA_\d{8}_\d+\.pdf$/i.test(f)).sort();
    for (const f of files) pages.push({ date: d, page: (f.match(/_(\d+)\.pdf$/i) || [])[1], path: join(dir, d, f) });
  }
  const done = new Set(); let nextIdx = 90000001;
  if (existsSync(OUT_JSONL)) for (const line of (await readFile(OUT_JSONL, "utf8")).split("\n")) {
    if (!line.trim()) continue; try { const a = JSON.parse(line); done.add(`${a.date}_${a.page}`); nextIdx = Math.max(nextIdx, a.idxno + 1); } catch {}
  }
  const todo = pages.filter((p) => !done.has(`${p.date}_${p.page}`)).slice(0, limit || undefined);
  console.log(`이번 실행 ${todo.length}p · 방식=Haiku 컬럼타일링(${TILE_COLS}열) · 구조화=${MODEL} · ${RENDER_DPI}dpi`);

  let inTok = 0, outTok = 0, nArticles = 0, nPhotos = 0, nFlag = 0;
  for (let i = 0; i < todo.length; i++) {
    const { date, page, path } = todo[i];
    const prefix = join(TMP, `${date}_${page}`);
    try {
      await sh("pdftoppm", ["-png", "-r", String(RENDER_DPI), "-singlefile", path, prefix]);
      const full = `${prefix}.png`;
      const { stdout } = await sh("sips", ["-g", "pixelWidth", "-g", "pixelHeight", full]);
      const fw = Number((stdout.match(/pixelWidth:\s*(\d+)/) || [])[1]);
      const fh = Number((stdout.match(/pixelHeight:\s*(\d+)/) || [])[1]);
      const apiJpg = `${prefix}_api.jpg`;
      await sh("sips", ["-Z", "1568", "-s", "format", "jpeg", "-s", "formatOptions", "85", full, "--out", apiJpg]);

      // ① 컬럼 타일 OCR
      const ocr = await tileOCR(path, prefix, fw, fh);
      inTok += ocr.usage.input_tokens; outTok += ocr.usage.output_tokens;
      if (!ocr.text.trim()) { console.log(`\n[빈 OCR ${date} ${page}]`); await appendFile(OUT_REVIEW, `${date}_${page}\t빈 OCR\n`); continue; }

      // ② 구조화
      const { articles, usage, truncated, parseFailed } = await structure(apiJpg, ocr.text);
      inTok += usage.input_tokens; outTok += usage.output_tokens;
      if (truncated || parseFailed) { const why = parseFailed ? "구조화 파싱실패" : "구조화 절단"; console.log(`\n[⚠️ ${date} ${page}] ${why}`); await appendFile(OUT_REVIEW, `${date}_${page}\t${why}\n`); }

      for (let a = 0; a < articles.length; a++) {
        const art = articles[a];
        if (!art?.title || !art?.body) continue;
        const body = String(art.body);
        const faith = faithfulness(body, ocr.text);
        if (faith < minFaith) { nFlag++; await appendFile(OUT_REVIEW, `${date}_${page}\t기사${a} 충실도 ${faith.toFixed(2)} (<${minFaith})\n`); }
        const idxno = nextIdx++;
        let images = [], leadImage = null;
        if (art.photo && fw && fh) {
          const { x, y, w, h } = art.photo;
          const X = Math.max(0, Math.round(x * fw)), Y = Math.max(0, Math.round(y * fh));
          const W = Math.min(fw - X, Math.round(w * fw)), H = Math.min(fh - Y, Math.round(h * fh));
          if (W > 80 && H > 60) {
            try {
              const cpng = `${prefix}_p${a}.png`, cjpg = `${prefix}_p${a}.jpg`;
              await sh("pdftoppm", ["-png", "-r", String(RENDER_DPI), "-singlefile", "-x", String(X), "-y", String(Y), "-W", String(W), "-H", String(H), path, `${prefix}_p${a}`]);
              await sh("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", cpng, "--out", cjpg]);
              const key = `ebook/${date}/p${page}_a${a}.jpg`;
              await sh("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/${key}`, "--file", cjpg, "--content-type", "image/jpeg", "--remote"]);
              leadImage = `${PHOTO_BASE}/${key}`; images = [leadImage]; nPhotos++;
            } catch {}
          }
        }
        const rec = {
          idxno, date, page, title: String(art.title),
          publishedAt: `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00+09:00`,
          year: Number(date.slice(0, 4)), section: `지면 ${page}면`,
          category: CATS.includes(art.category) ? art.category : "society",
          author: null, membersOnly: false, ocrEngine: "haiku_tile", faithfulness: Number(faith.toFixed(3)),
          bodyChars: body.length, excerpt: body.replace(/\s+/g, " ").slice(0, 158) + "…",
          body, images, leadImage, url: null,
        };
        await appendFile(OUT_JSONL, JSON.stringify(rec) + "\n");
        nArticles++;
      }
      process.stdout.write(`\r[${i + 1}/${todo.length}] ${date} ${page}면 · 기사 ${nArticles} · 사진 ${nPhotos} · 충실도경고 ${nFlag}   `);
    } catch (e) { console.log(`\n[실패 ${date} ${page}] ${e.message}`); }
  }
  const cost = (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT;
  console.log(`\n\n=== 완료 ===`);
  console.log(`기사 ${nArticles} · 사진 ${nPhotos} · 충실도경고 ${nFlag}건`);
  console.log(`Haiku in ${inTok} / out ${outTok} ≈ $${cost.toFixed(4)} (컬럼 ${TILE_COLS}장 + 구조화 1회 /면)`);
  console.log(`출력: ${OUT_JSONL}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
