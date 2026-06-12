#!/usr/bin/env node
// 기존 기사(JSONL·idxno·본문 보존)의 "기사영역 클립"만 트림 로직으로 재생성 → R2 동일키 덮어쓰기 + D1 버전URL 갱신
// 전체 재실행(idxno 재배정) 없이 사진만 개선할 때 사용.
//
// 사용: export GOOGLE_VISION_API_KEY=... ; node reclip.mjs --dir "/Users/nctoo/Downloads/예전홈피_자료"
// 옵션: --skip 90000001,90000013,90000030  (수동 사진 유지할 idxno; 기본값 동일)

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "out");
const JSONL = join(OUT_DIR, "ebook_articles.jsonl");
const TMP = join(OUT_DIR, "tmp");
const R2_BUCKET = "taean-archive-photos";
const PHOTO_BASE = "https://taean-insight-api.chs9182.workers.dev/api/archive/photo";
const GV_KEY = process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_API_KEY;
const RENDER_DPI = Number(process.env.RENDER_DPI || "300");
const PHOTO_PAD = Number(process.env.PHOTO_PAD || "0.03");

function arg(n, d) { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : d; }
async function sh(c, a) { return exec(c, a, { maxBuffer: 96 * 1024 * 1024 }); }
const normH = (s) => (s || "").replace(/[^가-힣0-9A-Za-z]/g, "");

async function googleVisionOCR(jpg) {
  const content = (await readFile(jpg)).toString("base64");
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GV_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: ["ko", "zh"] } }] }),
  });
  if (!res.ok) throw new Error(`Vision ${res.status}`);
  const r = ((await res.json()).responses || [])[0] || {};
  if (r.error) throw new Error(`Vision: ${r.error.message}`);
  const fta = r.fullTextAnnotation; if (!fta) return [];
  const lines = [];
  for (const pg of (fta.pages || [])) {
    const W = pg.width || 1, H = pg.height || 1;
    for (const bl of (pg.blocks || [])) for (const pa of (bl.paragraphs || [])) {
      let t = "";
      for (const w of (pa.words || [])) for (const sym of (w.symbols || [])) {
        t += sym.text || "";
        const br = sym.property && sym.property.detectedBreak;
        if (br && ["SPACE", "EOL_SURE_SPACE", "LINE_BREAK"].includes(br.type)) t += " ";
      }
      const vs = (pa.boundingBox && pa.boundingBox.vertices) || []; if (vs.length < 2) continue;
      const xs = vs.map((v) => v.x || 0), ys = vs.map((v) => v.y || 0);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
      if (t.trim()) lines.push({ t: t.trim(), x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H });
    }
  }
  return lines;
}

// 기사영역 + 이웃 충돌 인식 트림 (digitize-ocr.mjs와 동일 로직)
function articleRegion(art, lines) {
  const body = normH((art.title || "") + " " + (art.body || ""));
  const mine = [], foreign = [];
  for (const l of lines) { const t = normH(l.t); if (t.length >= 5 && body.includes(t)) mine.push(l); else foreign.push(l); }
  if (mine.length < 3) return null;
  const cx0 = Math.min(...mine.map((b) => b.x)), cy0 = Math.min(...mine.map((b) => b.y));
  const cx1 = Math.max(...mine.map((b) => b.x + b.w)), cy1 = Math.max(...mine.map((b) => b.y + b.h));
  const pad = PHOTO_PAD, gap = 0.004;
  let x0 = Math.max(0, cx0 - pad), y0 = Math.max(0, cy0 - pad);
  let x1 = Math.min(1, cx1 + pad), y1 = Math.min(1, cy1 + pad);
  for (const f of foreign) {
    const fx0 = f.x, fy0 = f.y, fx1 = f.x + f.w, fy1 = f.y + f.h;
    if (!(fx1 > x0 && fx0 < x1 && fy1 > y0 && fy0 < y1)) continue;
    if (fx0 >= cx1) x1 = Math.max(cx1, Math.min(x1, fx0 - gap));
    else if (fx1 <= cx0) x0 = Math.min(cx0, Math.max(x0, fx1 + gap));
    else if (fy0 >= cy1) y1 = Math.max(cy1, Math.min(y1, fy0 - gap));
    else if (fy1 <= cy0) y0 = Math.min(cy0, Math.max(y0, fy1 + gap));
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

async function main() {
  const dir = arg("--dir");
  if (!dir) { console.error("--dir 필요"); process.exit(1); }
  if (!GV_KEY) { console.error("GOOGLE_VISION_API_KEY 필요"); process.exit(1); }
  const skip = new Set((arg("--skip", "90000001,90000013,90000030,90000035,90000036,90000037,90000038,90000039,90000044,90000045,90000046,90000047,90000049,90000053,90000063,90000066,90000067,90000068,90000069,90000082,90000084,90000087,90000088,90000104,90000105")).split(",").map(Number));
  await mkdir(TMP, { recursive: true });

  const A = (await readFile(JSONL, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse)
    .filter((a) => a.leadImage && !skip.has(a.idxno));
  const byPage = {};
  for (const a of A) (byPage[`${a.date}_${a.page}`] = byPage[`${a.date}_${a.page}`] || []).push(a);
  const pages = Object.keys(byPage).sort();
  console.log(`재클립 대상: 기사 ${A.length}건 / ${pages.length}면 (수동 유지 ${skip.size}건 제외)`);

  const V = "v" + Math.floor(Date.now() / 1000);
  const sqls = [];
  let done = 0, redone = 0;

  for (const key of pages) {
    const [date, page] = key.split("_");
    const pdf = join(dir, date, `TA_${date}_${page}.pdf`);
    if (!existsSync(pdf)) { console.log(`\n[누락 ${key}] ${pdf}`); continue; }
    const prefix = join(TMP, `rc_${key}`);
    try {
      await sh("pdftoppm", ["-png", "-r", String(RENDER_DPI), "-singlefile", pdf, prefix]);
      const full = `${prefix}.png`;
      const { stdout } = await sh("sips", ["-g", "pixelWidth", "-g", "pixelHeight", full]);
      const fw = Number(stdout.match(/pixelWidth:\s*(\d+)/)[1]), fh = Number(stdout.match(/pixelHeight:\s*(\d+)/)[1]);
      const gjpg = `${prefix}_g.jpg`;
      await sh("sips", ["-Z", "3000", "-s", "format", "jpeg", "-s", "formatOptions", "90", full, "--out", gjpg]);
      const lines = await googleVisionOCR(gjpg);

      for (const art of byPage[key]) {
        const r = articleRegion(art, lines);
        if (!r) continue;                              // 매칭 부족 → 기존 클립 유지
        const X = Math.max(0, Math.round(r.x * fw)), Y = Math.max(0, Math.round(r.y * fh));
        const W = Math.min(fw - X, Math.round(r.w * fw)), H = Math.min(fh - Y, Math.round(r.h * fh));
        if (W < 120 || H < 90) continue;
        const r2key = art.leadImage.split("/photo/")[1].split("?")[0];
        const cpng = `${prefix}_i${art.idxno}`;
        await sh("pdftoppm", ["-png", "-r", String(RENDER_DPI), "-singlefile", "-x", String(X), "-y", String(Y), "-W", String(W), "-H", String(H), pdf, cpng]);
        await sh("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", `${cpng}.png`, "--out", `${cpng}.jpg`]);
        await sh("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/${r2key}`, "--file", `${cpng}.jpg`, "--content-type", "image/jpeg", "--remote"]);
        const url = `${PHOTO_BASE}/${r2key}?${V}`;
        sqls.push(`UPDATE archive_articles SET lead_image='${url}', images=json_array('${url}') WHERE idxno=${art.idxno};`);
        redone++;
      }
      done++;
      process.stdout.write(`\r[${done}/${pages.length}] ${key} · 재클립 ${redone}   `);
    } catch (e) { console.log(`\n[실패 ${key}] ${e.message}`); }
  }

  if (sqls.length) {
    const f = join(OUT_DIR, "reclip_update.sql");
    await writeFile(f, sqls.join("\n") + "\n");
    console.log(`\nD1 갱신 ${sqls.length}건 적용 중...`);
    await sh("npx", ["wrangler", "d1", "execute", "taean-archive", "--remote", "--file", f]);
  }
  console.log(`\n=== 완료 === 재클립 ${redone}건 · 버전 ${V}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
