#!/usr/bin/env node
// 지면 PDF → ① macOS Vision OCR(로컬·무료·충실 전사) → ② 컬럼 정렬 → ③ Haiku 구조화(전사 금지)
//            → ④ 충실도 가드 → ⑤ 사진 크롭(R2) → JSONL
// 텍스트 진실원천 = Apple Vision OCR(해상도 제한 없음). LLM은 정확한 텍스트를 기사로 분리만 한다.
//
// 사용:
//   swiftc -O ocr_vision.swift -o ocr_vision   (최초 1회)
//   export ANTHROPIC_API_KEY=sk-ant-...
//   node digitize-ocr.mjs --dir /tmp/ebook_c2 --limit 1
//   환경: RENDER_DPI(기본 300) · OCR_COLS(컬럼정렬 빈수, 기본 6) · ANTHROPIC_MODEL(기본 Haiku)
//
// 의존: pdftoppm, sips (Mac), ./ocr_vision (Apple Vision), wrangler(R2). Node 20+.

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
const OUT_DROPPED = join(OUT_DIR, "ebook_dropped_ads.txt"); // 제외한 광고 기록(은닉 유실 방지)
const TMP = join(OUT_DIR, "tmp");
const OCR_BIN = join(__dir, "ocr_vision");
const R2_BUCKET = "taean-archive-photos";
const PHOTO_BASE = "https://taean-insight-api.chs9182.workers.dev/api/archive/photo";

const OCR_ENGINE = (process.env.OCR_ENGINE || "apple").toLowerCase(); // apple | google
const GV_KEY = process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const PRICE_IN = Number(process.env.PRICE_IN || "1.0");
const PRICE_OUT = Number(process.env.PRICE_OUT || "5.0");
const RENDER_DPI = Number(process.env.RENDER_DPI || "300");
const OCR_COLS = Number(process.env.OCR_COLS || "6"); // 컬럼 정렬 빈 수
const PHOTO_PAD = Number(process.env.PHOTO_PAD || "0.03"); // 사진 크롭 사방 여백(잘림 방지)
const CATS = ["tourism", "environment", "realestate", "policy", "industry", "culture", "society"];
function arg(name, def) { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : def; }
async function sh(cmd, args) { return exec(cmd, args, { maxBuffer: 96 * 1024 * 1024 }); }

// ── ① Apple Vision OCR (2-pass: 한글 + 한자) → 위치 병합 ─────────────────────
// Vision은 한 패스에 한글·한자를 못 섞음 → ko 패스(한글)+zh 패스(한자) 후 겹치지 않는 한자 추가.
async function runOCR(pngPath, langs, correction) {
  const { stdout } = await exec(OCR_BIN, [pngPath], {
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, OCR_LANGS: langs, OCR_CORRECTION: correction },
  });
  try { const v = JSON.parse(stdout); return Array.isArray(v) ? v : []; } catch { return []; }
}
function centerInside(a, b) { // b의 중심이 a 안에 있나
  const bx = b.x + b.w / 2, by = b.y + b.h / 2;
  return bx >= a.x && bx <= a.x + a.w && by >= a.y && by <= a.y + a.h;
}
async function appleVisionOCR(pngPath) {
  const ko = await runOCR(pngPath, "ko-KR,en-US", "1");        // 한글 본문(+보정)
  const zh = await runOCR(pngPath, "zh-Hant,zh-Hans", "0");    // 한자(제호·인명·제목)
  const hasHanja = (s) => /[㐀-鿿]/.test(s || "");
  const merged = [...ko];
  for (const z of zh) {
    if (!hasHanja(z.t)) continue;                  // 한자 없는 zh 결과는 무시(한글은 ko가 담당)
    if (!ko.some((k) => centerInside(k, z))) merged.push(z); // ko가 못 잡은 한자 영역만 추가
  }
  return merged;
}
// Google Cloud Vision DOCUMENT_TEXT_DETECTION — 문단 단위 라인+박스 (한글·한자 혼용 1패스)
async function googleVisionOCR(pngPath) {
  const content = (await readFile(pngPath)).toString("base64");
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GV_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: ["ko", "zh"] } }] }),
  });
  if (!res.ok) throw new Error(`Vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const r = ((await res.json()).responses || [])[0] || {};
  if (r.error) throw new Error(`Vision: ${r.error.message}`);
  const fta = r.fullTextAnnotation; if (!fta) return [];
  const lines = [];
  for (const pg of (fta.pages || [])) {
    const W = pg.width || 1, H = pg.height || 1;
    for (const bl of (pg.blocks || [])) for (const pa of (bl.paragraphs || [])) {
      let t = "";
      for (const w of (pa.words || [])) for (const s of (w.symbols || [])) {
        t += s.text || "";
        const br = s.property && s.property.detectedBreak;
        if (br && (br.type === "SPACE" || br.type === "EOL_SURE_SPACE" || br.type === "LINE_BREAK")) t += " ";
      }
      const vs = (pa.boundingBox && pa.boundingBox.vertices) || []; if (vs.length < 2) continue;
      const xs = vs.map((v) => v.x || 0), ys = vs.map((v) => v.y || 0);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
      if (t.trim()) lines.push({ t: t.trim(), x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H });
    }
  }
  return lines;
}
async function visionOCR(pngPath) {
  return OCR_ENGINE === "google" ? googleVisionOCR(pngPath) : appleVisionOCR(pngPath);
}

// ── 사진 검출: OCR 글자상자가 없는 "큰 빈 직사각형" = 사진 (Haiku 좌표 대체/정밀화) ──
function largestEmptyRect(g, ROWS, COLS) {
  const heights = new Int32Array(COLS); let best = null;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) heights[c] = g[r][c] ? 0 : heights[c] + 1;
    const st = [];
    for (let c = 0; c <= COLS; c++) {
      const h = c < COLS ? heights[c] : 0; let start = c;
      while (st.length && st[st.length - 1].h >= h) {
        const t = st.pop(); const area = t.h * (c - t.start);
        if (!best || area > best.area) best = { area, r: r - t.h + 1, c: t.start, h: t.h, w: c - t.start };
        start = t.start;
      }
      st.push({ h, start });
    }
  }
  return best;
}
function detectPhotos(lines) {
  const COLS = 120, ROWS = 160;                       // 촘촘히 — 작은 사진 조각도 포착
  const g = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  const mark = (x0, y0, x1, y1) => { for (let r = Math.max(0, y0); r < Math.min(ROWS, y1); r++) for (let c = Math.max(0, x0); c < Math.min(COLS, x1); c++) g[r][c] = 1; };
  for (const l of lines) mark(Math.floor(l.x * COLS), Math.floor(l.y * ROWS), Math.ceil((l.x + l.w) * COLS), Math.ceil((l.y + l.h) * ROWS));
  mark(0, 0, COLS, Math.floor(0.08 * ROWS));          // 상단 제호 마진
  mark(0, Math.floor(0.97 * ROWS), COLS, ROWS);       // 하단 마진
  const photos = [];
  for (let it = 0; it < 12; it++) {
    const rc = largestEmptyRect(g, ROWS, COLS); if (!rc) break;
    const X = rc.c / COLS, Y = rc.r / ROWS, W = rc.w / COLS, H = rc.h / ROWS;
    if (W < 0.07 || H < 0.05 || W * H < 0.005) break; // 거터·여백 제외, 작은 인물사진은 포착
    photos.push({ x: X, y: Y, w: W, h: H });
    mark(rc.c, rc.r, rc.c + rc.w, rc.r + rc.h);
  }
  return photos;
}
// 단일 대형 사진 → 정밀 검출박스 / 다중·조각(인물 그리드) → Haiku힌트+조각 합집합(블록 전체)
function pickPhoto(detected, hint) {
  if (!hint) return detected[0] || null;
  const m = 0.05;
  const rel = detected.filter((d) => { const cx = d.x + d.w / 2, cy = d.y + d.h / 2; return cx >= hint.x - m && cx <= hint.x + hint.w + m && cy >= hint.y - m && cy <= hint.y + hint.h + m; });
  if (!rel.length) return hint;
  const big = rel.find((d) => d.w * d.h >= 0.5 * (hint.w * hint.h)); // hint 면적 절반↑ = 단일 대형 사진
  if (big) return big;
  const boxes = [hint, ...rel];                       // 그리드: 힌트+조각 전부 합쳐 블록 통째로
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: Math.max(0, x0), y: Math.max(0, y0), w: Math.min(1, x1) - Math.max(0, x0), h: Math.min(1, y1) - Math.max(0, y0) };
}

// ── 기사 영역 크롭: 본문에 매칭되는 OCR 라인들의 경계상자 = 기사 영역(사진 자연 포함) ──
// 사진을 정밀 검출하는 대신 "기사 전체(텍스트+사진)"를 통째로 보여줌 → 위치 검출 실패 우회.
function articleRegion(art, lines, photoBox) {
  const body = normH((art.title || "") + " " + (art.body || ""));
  const mine = [], foreign = [];
  for (const l of lines) {
    const t = normH(l.t);
    if (t.length >= 5 && body.includes(t)) mine.push(l); else foreign.push(l);
  }
  if (photoBox) mine.push(photoBox);
  if (mine.length < 3) return photoBox;              // 매칭 부족 → 기존 사진박스
  // 핵심(core) 박스 = 기사 자신의 라인들
  const cx0 = Math.min(...mine.map((b) => b.x)), cy0 = Math.min(...mine.map((b) => b.y));
  const cx1 = Math.max(...mine.map((b) => b.x + b.w)), cy1 = Math.max(...mine.map((b) => b.y + b.h));
  // 희망 패딩으로 확장 후, 패딩 밴드에 침범한 "남의" 라인 직전까지 트림 (만화·옆기사 번짐 방지)
  const pad = PHOTO_PAD, gap = 0.004;
  let x0 = Math.max(0, cx0 - pad), y0 = Math.max(0, cy0 - pad);
  let x1 = Math.min(1, cx1 + pad), y1 = Math.min(1, cy1 + pad);
  for (const f of foreign) {
    const fx0 = f.x, fy0 = f.y, fx1 = f.x + f.w, fy1 = f.y + f.h;
    if (!(fx1 > x0 && fx0 < x1 && fy1 > y0 && fy0 < y1)) continue;  // 박스 밖
    if (fx0 >= cx1) x1 = Math.max(cx1, Math.min(x1, fx0 - gap));        // 오른쪽 밴드 침범
    else if (fx1 <= cx0) x0 = Math.min(cx0, Math.max(x0, fx1 + gap));   // 왼쪽
    else if (fy0 >= cy1) y1 = Math.max(cy1, Math.min(y1, fy0 - gap));   // 아래
    else if (fy1 <= cy0) y0 = Math.min(cy0, Math.max(y0, fy1 + gap));   // 위
    // core 내부와 겹치는 foreign(오인식 등)은 트림 불가 — 무시
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, padded: true };
}

// ── 사진/텍스트그래픽 판별: 크롭 영역의 "중간톤 비율"로 진짜 사진인지 검사 ──────
// 진짜 사진(인물·건물)=연속계조(중간 회색 많음). 제목 캘리그래피·큰 한자·선화=흑백 이분(중간톤 적음).
async function isRealPhoto(pdfPath, prefix, box, fw, fh) {
  const dpi = 40, sx = dpi / RENDER_DPI;
  const x = Math.round(box.x * fw * sx), y = Math.round(box.y * fh * sx);
  const w = Math.round(box.w * fw * sx), h = Math.round(box.h * fh * sx);
  if (w < 5 || h < 5) return true;                 // 너무 작으면 판단 보류(유지)
  const out = `${prefix}_chk`;
  try {
    await sh("pdftoppm", ["-gray", "-r", String(dpi), "-singlefile", "-x", String(x), "-y", String(y), "-W", String(w), "-H", String(h), pdfPath, out]);
    const buf = await readFile(`${out}.pgm`);
    let i = 0; const tok = () => { while (i < buf.length && (buf[i] === 32 || buf[i] === 10 || buf[i] === 9 || buf[i] === 13)) i++; const s = i; while (i < buf.length && !(buf[i] === 32 || buf[i] === 10 || buf[i] === 9 || buf[i] === 13)) i++; return buf.slice(s, i).toString(); };
    tok();/*P5*/ tok();/*W*/ tok();/*H*/ tok();/*max*/ i++; // maxval 뒤 공백 1개 스킵
    const data = buf.slice(i);
    let mid = 0, total = 0;
    for (let p = 0; p < data.length; p++) { const v = data[p]; total++; if (v >= 50 && v <= 205) mid++; }
    const ratio = total ? mid / total : 0;
    return { real: ratio >= PHOTO_MIDTONE_MIN, ratio };  // 중간톤 비율로 사진/텍스트그래픽 판별
  } catch { return { real: true, ratio: 1 }; }       // 실패 시 보수적으로 유지
}
// 히스토그램 필터 기본 OFF — 어두운 실제 사진(안면소방대 0.26)이 텍스트그래픽(守歲 0.289)보다
// 낮게 나와 중간톤으로는 구분 불가. 텍스트그래픽(守歲 등)은 사후 수동 처리.
const PHOTO_MIDTONE_MIN = Number(process.env.PHOTO_MIDTONE_MIN || "0");

// ── ② 컬럼 정렬: x-중심으로 컬럼 빈 분류 → 컬럼별(좌→우) 내부 top→bottom ──────
function columnSort(lines) {
  if (!lines.length) return "";
  // 전폭 라인(제호/헤드라인 등 w 큰 것)은 상단에 y순으로
  const wide = lines.filter((l) => l.w >= 0.55).sort((a, b) => a.y - b.y);
  const narrow = lines.filter((l) => l.w < 0.55);
  const binOf = (l) => Math.min(OCR_COLS - 1, Math.max(0, Math.floor((l.x + l.w / 2) * OCR_COLS)));
  narrow.sort((a, b) => (binOf(a) - binOf(b)) || (a.y - b.y));
  const ordered = [...wide, ...narrow];
  return ordered.map((l) => l.t).join("\n");
}

// ── ③ 구조화: 이미지 + 정확한 OCR 텍스트 → 기사 분리(전사 금지) + 사진 박스 ──
function structurePrompt(ocrText) {
  return `아래 [OCR]는 이 신문 지면을 전용 OCR로 정확히 전사한 텍스트입니다(대체로 컬럼 순서).
이미지를 참고하여 기사들을 구분해 JSON 배열로만 출력하세요(설명·코드펜스 없이 JSON만).
절대 규칙(충실 전사):
- body는 [OCR] 텍스트의 글자를 그대로 사용. 맞춤법·표현 수정·요약·재작성 금지.
- 허용: (a) 어느 줄이 어느 기사에 속하는지 분류·재배열, (b) 단락 구분(\\n\\n), (c) 컬럼 경계로 끊긴 문장 잇기, (d) 컬럼 줄바꿈 때문에 단어 중간에 들어간 공백 제거(예: "발 전을"→"발전을") — 단, 글자 자체는 절대 변경 금지.
- [OCR]에 없는 내용 추가 금지. 목차·제호(신문 머리글)·판권은 출력에서 제외.
- 광고/홍보(은행·기업 상품광고, 슬로건, 전화번호·상담문의, 시세표·분양 안내 등)는 제외하지 말고 "isAd": true 로 표시하세요. 일반 기사는 "isAd": false.
각 기사: {"title","body","category"(후보: ${CATS.join(", ")}),"photo":{x,y,w,h 0~1}|null,"isAd": true/false}
- title은 지면 큰 제목(없으면 body 첫 문장). photo는 이미지 비율 좌표, 없으면 null.
[OCR]
${ocrText}`;
}
async function structure(apiJpg, ocrText) {
  const data = (await readFile(apiJpg)).toString("base64");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 8192,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
        { type: "text", text: structurePrompt(ocrText) },
      ] }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = (j.content || []).map((c) => c.text || "").join("");
  const usage = j.usage || { input_tokens: 0, output_tokens: 0 };
  const m = text.match(/\[[\s\S]*\]/);
  let articles = [], parseFailed = false;
  try { articles = JSON.parse(m ? m[0] : text); } catch { parseFailed = true; }
  return { articles: Array.isArray(articles) ? articles : [], usage, truncated: j.stop_reason === "max_tokens", parseFailed };
}

// ── ④ 충실도 가드 (body가 OCR에서 유래했는지 4-gram 겹침) ──────────────────
function ngrams(s, n = 4) { const o = new Set(); for (let i = 0; i + n <= s.length; i++) o.add(s.slice(i, i + n)); return o; }
function normH(s) { return (s || "").replace(/[^가-힣0-9A-Za-z]/g, ""); }
function faithfulness(body, ocrText) {
  const b = normH(body); if (b.length < 8) return 1;
  const og = ngrams(normH(ocrText)), bg = ngrams(b);
  if (bg.size === 0) return 1;
  let hit = 0; for (const g of bg) if (og.has(g)) hit++;
  return hit / bg.size;
}

// 광고 휴리스틱 백스톱 (LLM이 isAd 놓친 경우 대비) — 보수적으로 강할 때만
function looksLikeAd(title, body) {
  const t = `${title}\n${body}`;
  let s = 0;
  if (/은행|증권|보험|카드|대출|투자여행|분양|무이자|상담\s*문의|☎|\d{2,4}-\d{3,4}-\d{4}/.test(t)) s++;
  if (/(하세요|드립니다|모십니다|만나보세요|동행하)/.test(t)) s++;
  if ((t.match(/선정|수상|획득/g) || []).length >= 2) s++; // 광고성 수상 나열
  return s >= 3; // 매우 확실할 때만 true(오탐 방지)
}

async function main() {
  const dir = arg("--dir");
  if (!dir) { console.error("--dir <경로> 필요"); process.exit(1); }
  if (OCR_ENGINE === "apple" && !existsSync(OCR_BIN)) { console.error(`${OCR_BIN} 없음 — 먼저: swiftc -O ocr_vision.swift -o ocr_vision`); process.exit(1); }
  if (OCR_ENGINE === "google" && !GV_KEY) { console.error("GOOGLE_VISION_API_KEY(또는 GOOGLE_API_KEY) 필요 — Cloud Vision API 사용설정"); process.exit(1); }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY 필요(구조화용)"); process.exit(1); }
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
  const ocrName = OCR_ENGINE === "google" ? "Google Vision(클라우드)" : "Apple Vision(로컬·무료)";
  console.log(`이번 실행 ${todo.length}p · OCR=${ocrName} · 구조화=${MODEL} · ${RENDER_DPI}dpi`);

  let inTok = 0, outTok = 0, nArticles = 0, nPhotos = 0, nFlag = 0, nDrop = 0;
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

      // 지면 이미지 1회 업로드 — 이 면의 모든 기사가 공유 (목록 썸네일 + 원본 지면 보기)
      const pageJpg = `${prefix}_page.jpg`;
      await sh("sips", ["-Z", "1600", "-s", "format", "jpeg", "-s", "formatOptions", "80", full, "--out", pageJpg]);
      await sh("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/ebook/${date}/page_${page}.jpg`, "--file", pageJpg, "--content-type", "image/jpeg", "--remote"]);
      const pageFull = `${prefix}_pagefull.jpg`;   // 고해상(확대 보기용)
      await sh("sips", ["--resampleWidth", "1800", "-s", "format", "jpeg", "-s", "formatOptions", "82", full, "--out", pageFull]);
      await sh("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/ebook/${date}/page_${page}full.jpg`, "--file", pageFull, "--content-type", "image/jpeg", "--remote"]);
      nPhotos++; // = 업로드한 지면 수

      // ① OCR(로컬) + ② 컬럼정렬
      // OCR 입력: 구글은 업로드 크기 절감(고품질 JPEG ~1-2MB), 애플은 로컬이라 원본 PNG
      let ocrInput = full;
      if (OCR_ENGINE === "google") {
        ocrInput = `${prefix}_gocr.jpg`;
        await sh("sips", ["-Z", "3000", "-s", "format", "jpeg", "-s", "formatOptions", "90", full, "--out", ocrInput]);
      }
      const ocrLines = await visionOCR(ocrInput);
      const ocrText = columnSort(ocrLines);
      const detectedPhotos = detectPhotos(ocrLines); // 빈 영역 기반 사진 박스
      if (!ocrText.trim()) { console.log(`\n[빈 OCR ${date} ${page}]`); await appendFile(OUT_REVIEW, `${date}_${page}\t빈 OCR\n`); continue; }

      // ③ 구조화
      const { articles, usage, truncated, parseFailed } = await structure(apiJpg, ocrText);
      inTok += usage.input_tokens; outTok += usage.output_tokens;
      if (truncated || parseFailed) { const why = parseFailed ? "구조화 파싱실패" : "구조화 절단"; console.log(`\n[⚠️ ${date} ${page}] ${why}`); await appendFile(OUT_REVIEW, `${date}_${page}\t${why}\n`); }

      for (let a = 0; a < articles.length; a++) {
        const art = articles[a];
        if (!art?.title || !art?.body) continue;
        const body = String(art.body);
        // 광고 제외 (LLM isAd 1차 + 휴리스틱 백스톱) — 드롭하되 기록(은닉 유실 방지)
        if (art.isAd === true || looksLikeAd(String(art.title), body)) {
          nDrop++;
          await appendFile(OUT_DROPPED, `${date}_${page}\t${String(art.title).replace(/\s+/g, " ").slice(0, 50)}\n`);
          continue;
        }
        const faith = faithfulness(body, ocrText);
        if (faith < minFaith) { nFlag++; await appendFile(OUT_REVIEW, `${date}_${page}\t기사${a} 충실도 ${faith.toFixed(2)} (<${minFaith})\n`); }
        const idxno = nextIdx++;
        // 기사별 크롭 없음 — 지면 1장을 그 면의 모든 기사가 공유(목록 썸네일 + 리더 하단 '원본 지면').
        // images는 비움(본문 인라인 중복 방지). 지면 업로드는 페이지 루프에서 1회만 수행(아래).
        const leadImage = `${PHOTO_BASE}/ebook/${date}/page_${page}.jpg`;
        const images = [];
        const rec = {
          idxno, date, page, title: String(art.title),
          publishedAt: `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00+09:00`,
          year: Number(date.slice(0, 4)), section: `지면 ${page}면`,
          category: CATS.includes(art.category) ? art.category : "society",
          author: null, membersOnly: false, ocrEngine: OCR_ENGINE === "google" ? "google_vision" : "apple_vision", faithfulness: Number(faith.toFixed(3)),
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
  console.log(`기사 ${nArticles} · 사진 ${nPhotos} · 광고제외 ${nDrop}건 · 충실도경고 ${nFlag}건`);
  console.log(`OCR=${ocrName} · 구조화 Haiku in ${inTok}/out ${outTok} ≈ $${cost.toFixed(4)} (≈${nArticles ? (cost / Math.max(1, todo.length)).toFixed(4) : 0}/면)`);
  console.log(`출력: ${OUT_JSONL}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
