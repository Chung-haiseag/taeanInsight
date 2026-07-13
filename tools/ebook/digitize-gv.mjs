#!/usr/bin/env node
// 지면 PDF → ① Google Cloud Vision OCR(충실 텍스트, 환각 0) → ② LLM 구조화(전사 금지, 분리만)
//            → ③ 사진 크롭(R2) → 기사 JSONL
// 핵심: 본문 텍스트의 "진실 원천"은 전용 OCR(구글 비전). LLM은 그 정확한 텍스트를
//       기사 단위로 "구분/정리"만 하고, 사진 박스만 이미지에서 찾는다(전사 X → 사실 환각 불가).
//       구조화 결과는 OCR 텍스트와 n-gram 대조(충실도 가드)로 검증한다.
//
// 사용:
//   export GOOGLE_VISION_API_KEY=...   (또는 GOOGLE_API_KEY; Cloud Vision API 사용설정 필요)
//   export ANTHROPIC_API_KEY=sk-ant-... (구조화용; ANTHROPIC_MODEL로 모델 교체 가능, 기본 Haiku)
//   node digitize-gv.mjs --dir "/Users/nctoo/Downloads/예전홈피_자료" --limit 1
//
// 의존: pdftoppm, sips (Mac), wrangler(R2). Node 20+.

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
const TMP = join(OUT_DIR, "tmp");
const R2_BUCKET = "taean-archive-photos";
const PHOTO_BASE = "https://taean-insight-api.chs9182.workers.dev/api/archive/photo";

// OCR 엔진 선택: clova(한글 특화·권장) | google
const OCR_ENGINE = (process.env.OCR_ENGINE || "clova").toLowerCase();
const GV_KEY = process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_API_KEY;
const CLOVA_URL = process.env.CLOVA_OCR_URL;        // NAVER Cloud OCR Domain의 APIGW Invoke URL
const CLOVA_SECRET = process.env.CLOVA_OCR_SECRET;  // X-OCR-SECRET
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001"; // 구조화용(텍스트+이미지)
// 비용 추정 단가($/M tokens, 구조화 LLM) + 구글비전(이미지당)
const PRICE_IN = Number(process.env.PRICE_IN || "1.0");
const PRICE_OUT = Number(process.env.PRICE_OUT || "5.0");
const GV_PER_IMAGE = Number(process.env.GV_PER_IMAGE || "0.0015"); // $1.5 / 1000장

const RENDER_DPI = Number(process.env.RENDER_DPI || "300"); // OCR·크롭 원본 해상도
const CATS = ["tourism", "environment", "realestate", "policy", "industry", "culture", "society"];

function arg(name, def) { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : def; }
async function sh(cmd, args) { return exec(cmd, args, { maxBuffer: 96 * 1024 * 1024 }); }

// ── ① Google Cloud Vision: DOCUMENT_TEXT_DETECTION (충실 텍스트) ──────────────
async function googleVisionOCR(jpgPath) {
  const content = (await readFile(jpgPath)).toString("base64");
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GV_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requests: [{
        image: { content },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ["ko"] },
      }],
    }),
  });
  if (!res.ok) throw new Error(`Vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const r = (j.responses || [])[0] || {};
  if (r.error) throw new Error(`Vision: ${r.error.message}`);
  const fta = r.fullTextAnnotation || {};
  return { text: fta.text || "", pages: fta.pages || [] };
}

// ── ①' NAVER CLOVA OCR (General, V2) — 한글 특화 충실 텍스트 ──────────────────
async function clovaOCR(jpgPath) {
  const data = (await readFile(jpgPath)).toString("base64");
  const ts = Date.now();
  const res = await fetch(CLOVA_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "X-OCR-SECRET": CLOVA_SECRET },
    body: JSON.stringify({
      version: "V2",
      requestId: `taean-${ts}`,
      timestamp: ts,
      lang: "ko",
      images: [{ format: "jpg", name: "page", data }],
    }),
  });
  if (!res.ok) throw new Error(`CLOVA ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const img = (j.images || [])[0] || {};
  if (img.inferResult && img.inferResult !== "SUCCESS") throw new Error(`CLOVA infer ${img.inferResult}: ${img.message || ""}`);
  // 인식된 필드를 lineBreak 기준으로 이어 붙여 본문 복원 (lineBreak=true → 줄바꿈)
  let text = "";
  for (const f of img.fields || []) {
    text += (f.inferText || "");
    text += f.lineBreak ? "\n" : " ";
  }
  return { text: text.trim(), pages: [] };
}

// OCR 디스패처
async function ocr(jpgPath) {
  if (OCR_ENGINE === "google") return googleVisionOCR(jpgPath);
  return clovaOCR(jpgPath);
}

// ── ② LLM 구조화: 이미지 + 정확한 OCR 텍스트 → 기사 분리(전사 금지) + 사진 박스 ──
function structurePrompt(ocrText) {
  return `아래 [OCR]는 이 신문 지면을 전용 OCR 엔진으로 인식한 "정확한 텍스트"입니다.
이미지를 참고하여 이 지면의 기사들을 구분해 JSON 배열로만 출력하세요(설명·코드펜스 없이 JSON만).

절대 규칙(충실 전사):
- body는 반드시 [OCR] 텍스트의 글자를 그대로 사용하세요. 맞춤법·표현을 고치거나 요약·윤문·재작성하지 마세요.
- 허용되는 가공은 (a) 어느 단락이 어느 기사에 속하는지 분류, (b) 단락 구분(\\n\\n), (c) OCR 줄바꿈으로 끊긴 단어 잇기뿐입니다.
- [OCR]에 없는 내용을 추가하거나 지어내지 마세요.
- 광고, 목차, 제호(신문 이름 머리글), 판권은 제외하세요.

각 기사: {"title": 제목, "body": 본문, "category": 후보중 하나, "photo": {"x":0~1,"y":0~1,"w":0~1,"h":0~1} 또는 null}
category 후보: ${CATS.join(", ")}
- title은 지면의 큰 제목을, 없으면 body 첫 문장을 사용.
- photo는 그 기사 사진 영역을 이미지 비율 좌표로(왼쪽위 0,0~오른쪽아래 1,1), 사진 없으면 null.

[OCR]
${ocrText}`;
}

async function structureWithLLM(jpgPath, ocrText) {
  const b64 = (await readFile(jpgPath)).toString("base64");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
          { type: "text", text: structurePrompt(ocrText) },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = (j.content || []).map((c) => c.text || "").join("");
  const usage = j.usage || { input_tokens: 0, output_tokens: 0 };
  const truncated = j.stop_reason === "max_tokens";
  const m = text.match(/\[[\s\S]*\]/);
  let articles = [];
  let parseFailed = false;
  try { articles = JSON.parse(m ? m[0] : text); } catch { parseFailed = true; }
  return { articles: Array.isArray(articles) ? articles : [], usage, truncated, parseFailed };
}

// ── 충실도 가드: body가 OCR 텍스트에서 유래했는지 4-gram 겹침률로 검증 ──────────
function normHangul(s) { return (s || "").replace(/[^가-힣㄰-㆏0-9A-Za-z]/g, ""); }
function ngrams(s, n = 4) { const out = new Set(); for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n)); return out; }
function faithfulness(body, ocrText) {
  const b = normHangul(body), o = normHangul(ocrText);
  if (b.length < 8) return 1; // 너무 짧으면 통과
  const og = ngrams(o), bg = ngrams(body && b);
  if (bg.size === 0) return 1;
  let hit = 0; for (const g of bg) if (og.has(g)) hit++;
  return hit / bg.size; // 1에 가까울수록 OCR 충실
}

async function main() {
  const dir = arg("--dir");
  if (!dir) { console.error("--dir <예전홈피_자료 경로> 필요"); process.exit(1); }
  if (OCR_ENGINE === "google" && !GV_KEY) { console.error("GOOGLE_VISION_API_KEY(또는 GOOGLE_API_KEY) 필요 — Cloud Vision API 사용설정"); process.exit(1); }
  if (OCR_ENGINE === "clova" && (!CLOVA_URL || !CLOVA_SECRET)) { console.error("CLOVA_OCR_URL + CLOVA_OCR_SECRET 필요 — NAVER Cloud OCR Domain의 Invoke URL·시크릿"); process.exit(1); }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY 필요(구조화용)"); process.exit(1); }
  const limit = Number(arg("--limit", "0"));
  const minFaith = Number(arg("--min-faith", "0.8"));
  await mkdir(TMP, { recursive: true });

  const dates = (await readdir(dir)).filter((d) => /^\d{8}$/.test(d)).sort();
  let pages = [];
  for (const d of dates) {
    const files = (await readdir(join(dir, d))).filter((f) => /^TA_\d{8}_\d+\.pdf$/i.test(f)).sort();
    for (const f of files) {
      const pp = (f.match(/_(\d+)\.pdf$/i) || [])[1];
      pages.push({ date: d, page: pp, path: join(dir, d, f) });
    }
  }

  const done = new Set();
  let nextIdx = 90000001;
  if (existsSync(OUT_JSONL)) {
    for (const line of (await readFile(OUT_JSONL, "utf8")).split("\n")) {
      if (!line.trim()) continue;
      try { const a = JSON.parse(line); done.add(`${a.date}_${a.page}`); nextIdx = Math.max(nextIdx, a.idxno + 1); } catch {}
    }
  }
  const todo = pages.filter((p) => !done.has(`${p.date}_${p.page}`)).slice(0, limit || undefined);
  const ocrName = OCR_ENGINE === "google" ? "Google Vision" : "NAVER CLOVA";
  console.log(`지면 ${pages.length}p · 이번 실행 ${todo.length}p · OCR=${ocrName} · 구조화=${MODEL} · ${RENDER_DPI}dpi`);

  let inTok = 0, outTok = 0, gvCalls = 0, nArticles = 0, nPhotos = 0, nFlag = 0;

  for (let i = 0; i < todo.length; i++) {
    const { date, page, path } = todo[i];
    const prefix = join(TMP, `${date}_${page}`);
    try {
      // 렌더(OCR·크롭 공용 원본)
      await sh("pdftoppm", ["-png", "-r", String(RENDER_DPI), "-singlefile", path, prefix]);
      const full = `${prefix}.png`;
      const { stdout } = await sh("sips", ["-g", "pixelWidth", "-g", "pixelHeight", full]);
      const fw = Number((stdout.match(/pixelWidth:\s*(\d+)/) || [])[1]);
      const fh = Number((stdout.match(/pixelHeight:\s*(\d+)/) || [])[1]);
      // OCR용 이미지(고품질 JPEG; 비전은 고해상에 강함)
      const ocrJpg = `${prefix}_ocr.jpg`;
      await sh("sips", ["-Z", "3000", "-s", "format", "jpeg", "-s", "formatOptions", "92", full, "--out", ocrJpg]);
      // 구조화용 이미지(LLM 비전 상한 1568)
      const apiJpg = `${prefix}_api.jpg`;
      await sh("sips", ["-Z", "1568", "-s", "format", "jpeg", "-s", "formatOptions", "80", full, "--out", apiJpg]);

      // ① OCR (CLOVA 또는 Google Vision)
      const ocrRes = await ocr(ocrJpg); gvCalls++;
      if (!ocrRes.text.trim()) { console.log(`\n[빈 OCR ${date} ${page}]`); await appendFile(OUT_REVIEW, `${date}_${page}\t빈 OCR\n`); continue; }

      // ② 구조화
      const { articles, usage, truncated, parseFailed } = await structureWithLLM(apiJpg, ocrRes.text);
      inTok += usage.input_tokens; outTok += usage.output_tokens;
      if (truncated || parseFailed) {
        const why = parseFailed ? "구조화 JSON 파싱 실패" : "구조화 출력 절단";
        console.log(`\n[⚠️ 재검토 ${date} ${page}] ${why}`); await appendFile(OUT_REVIEW, `${date}_${page}\t${why}\n`);
      }

      for (let a = 0; a < articles.length; a++) {
        const art = articles[a];
        if (!art?.title || !art?.body) continue;
        const body = String(art.body);
        const faith = faithfulness(body, ocrRes.text);        // ③ 충실도 가드
        const flagged = faith < minFaith;
        if (flagged) { nFlag++; await appendFile(OUT_REVIEW, `${date}_${page}\t기사${a} 충실도 ${faith.toFixed(2)} (<${minFaith}) — 본문이 OCR과 불일치\n`); }

        const idxno = nextIdx++;
        let images = [], leadImage = null;
        if (art.photo && fw && fh) {
          const { x, y, w, h } = art.photo;
          const X = Math.max(0, Math.round(x * fw)), Y = Math.max(0, Math.round(y * fh));
          const W = Math.min(fw - X, Math.round(w * fw)), H = Math.min(fh - Y, Math.round(h * fh));
          if (W > 80 && H > 60) {
            try {
              const cropPng = `${prefix}_a${a}.png`, cropJpg = `${prefix}_a${a}.jpg`;
              await sh("pdftoppm", ["-png", "-r", String(RENDER_DPI), "-singlefile", "-x", String(X), "-y", String(Y), "-W", String(W), "-H", String(H), path, `${prefix}_a${a}`]);
              await sh("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", cropPng, "--out", cropJpg]);
              const key = `ebook/${date}/p${page}_a${a}.jpg`;
              await sh("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/${key}`, "--file", cropJpg, "--content-type", "image/jpeg", "--remote"]);
              leadImage = `${PHOTO_BASE}/${key}`; images = [leadImage]; nPhotos++;
            } catch (e) { /* 크롭 실패 무시 */ }
          }
        }
        const rec = {
          idxno, date, page,
          title: String(art.title),
          publishedAt: `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00+09:00`,
          year: Number(date.slice(0, 4)),
          section: `지면 ${page}면`,
          category: CATS.includes(art.category) ? art.category : "society",
          author: null,
          membersOnly: false,
          ocrEngine: "google_vision",
          faithfulness: Number(faith.toFixed(3)),
          bodyChars: body.length,
          excerpt: body.replace(/\s+/g, " ").slice(0, 158) + "…",
          body,
          images, leadImage,
          url: null,
        };
        await appendFile(OUT_JSONL, JSON.stringify(rec) + "\n");
        nArticles++;
      }
      process.stdout.write(`\r[${i + 1}/${todo.length}] ${date} ${page}면 · 기사 ${nArticles} · 사진 ${nPhotos} · 충실도경고 ${nFlag}   `);
    } catch (e) {
      console.log(`\n[실패 ${date} ${page}] ${e.message}`);
    }
  }

  const llmCost = (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT;
  const gvCost = gvCalls * GV_PER_IMAGE;
  console.log(`\n\n=== 완료 ===`);
  console.log(`기사 ${nArticles} · 사진 ${nPhotos} · 충실도경고 ${nFlag}건(→ ${OUT_REVIEW})`);
  console.log(`${ocrName} ${gvCalls}장 ≈ $${gvCost.toFixed(4)}(근사) · 구조화 LLM in ${inTok}/out ${outTok} ≈ $${llmCost.toFixed(4)}`);
  console.log(`합계 ≈ $${(gvCost + llmCost).toFixed(4)}`);
  console.log(`출력: ${OUT_JSONL}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
