#!/usr/bin/env node
// 지면 PDF 스캔 → Claude Haiku 비전 OCR·구조화 → 기사(JSONL) + 사진 크롭(R2)
// 1990~2002 전자북(예전홈피_자료/YYYYMMDD/TA_YYYYMMDD_PP.pdf) 디지털화.
//
// 사용:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   node digitize.mjs --dir "/Users/nctoo/Downloads/예전홈피_자료" --limit 4   # 4페이지 시범
//   node digitize.mjs --dir "..."                                              # 전체
//   # 이후: node import-d1.mjs (out/ebook_articles.jsonl 적재)  +  사진은 자동 R2 업로드
//
// 의존: pdftoppm, sips (Mac), wrangler(R2). Node 20+.

import { readdir, mkdir, appendFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "out");
const OUT_JSONL = join(OUT_DIR, "ebook_articles.jsonl");
const TMP = join(OUT_DIR, "tmp");
const R2_BUCKET = "taean-archive-photos";
const PHOTO_BASE = "https://taean-insight-api.chs9182.workers.dev/api/archive/photo";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
// Haiku 대략 단가 ($/M tokens) — 비용 추정용. 실제 청구는 콘솔 확인.
const PRICE_IN = Number(process.env.PRICE_IN || "1.0");
const PRICE_OUT = Number(process.env.PRICE_OUT || "5.0");

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : def;
}

const CATS = ["tourism", "environment", "realestate", "policy", "industry", "culture", "society"];

const PROMPT = `이것은 한국 지역신문(주간 태안신문)의 한 지면 스캔 이미지입니다.
이 지면에 실린 "기사"들을 추출해 JSON 배열로만 출력하세요(설명·코드펜스 없이 JSON만).
각 기사: {"title": 제목, "body": 본문 전문(문단은 \\n\\n로 구분, OCR 오타는 자연스럽게 교정), "category": 아래 중 하나, "photo": 그 기사의 대표 사진 영역 {"x":0~1,"y":0~1,"w":0~1,"h":0~1} 페이지 비율 좌표 또는 null}
category 후보: ${CATS.join(", ")}
규칙:
- 광고, 목차, 제호(신문 이름 머리글), 판권은 제외.
- 사진이 없는 기사는 "photo": null.
- 사진 좌표는 페이지 전체 기준 비율(왼쪽위 0,0 ~ 오른쪽아래 1,1)로 사진 박스만 감싸게.
- 본문이 짧은 단신도 포함.`;

async function sh(cmd, args) {
  return exec(cmd, args, { maxBuffer: 64 * 1024 * 1024 });
}

async function callClaude(jpgPath) {
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
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = (j.content || []).map((c) => c.text || "").join("");
  const usage = j.usage || { input_tokens: 0, output_tokens: 0 };
  // JSON 추출 (코드펜스/잡텍스트 방어)
  const m = text.match(/\[[\s\S]*\]/);
  let articles = [];
  try { articles = JSON.parse(m ? m[0] : text); } catch { articles = []; }
  return { articles: Array.isArray(articles) ? articles : [], usage };
}

async function main() {
  const dir = arg("--dir");
  if (!dir) { console.error("--dir <예전홈피_자료 경로> 필요"); process.exit(1); }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY 환경변수 필요"); process.exit(1); }
  const limit = Number(arg("--limit", "0"));
  await mkdir(TMP, { recursive: true });

  // 대상 PDF 목록 (날짜폴더/TA_..._PP.pdf)
  const dates = (await readdir(dir)).filter((d) => /^\d{8}$/.test(d)).sort();
  let pages = [];
  for (const d of dates) {
    const files = (await readdir(join(dir, d))).filter((f) => /^TA_\d{8}_\d+\.pdf$/i.test(f)).sort();
    for (const f of files) {
      const pp = (f.match(/_(\d+)\.pdf$/i) || [])[1];
      pages.push({ date: d, page: pp, path: join(dir, d, f) });
    }
  }

  // 재개: 이미 처리한 (date,page) 제외, 다음 idxno
  const done = new Set();
  let nextIdx = 90000001;
  if (existsSync(OUT_JSONL)) {
    for (const line of (await readFile(OUT_JSONL, "utf8")).split("\n")) {
      if (!line.trim()) continue;
      try { const a = JSON.parse(line); done.add(`${a.date}_${a.page}`); nextIdx = Math.max(nextIdx, a.idxno + 1); } catch {}
    }
  }
  const todo = pages.filter((p) => !done.has(`${p.date}_${p.page}`)).slice(0, limit || undefined);

  console.log(`지면 ${pages.length}p (이미 ${pages.length - pages.filter((p)=>!done.has(`${p.date}_${p.page}`)).length}p 처리) · 이번 실행 ${todo.length}p · 모델 ${MODEL}`);
  let inTok = 0, outTok = 0, nArticles = 0, nPhotos = 0;

  for (let i = 0; i < todo.length; i++) {
    const { date, page, path } = todo[i];
    const prefix = join(TMP, `${date}_${page}`);
    try {
      // 고해상 렌더(크롭용) + API용 축소본
      await sh("pdftoppm", ["-png", "-r", "200", "-singlefile", path, prefix]);
      const full = `${prefix}.png`;
      const { stdout } = await sh("sips", ["-g", "pixelWidth", "-g", "pixelHeight", full]);
      const fw = Number((stdout.match(/pixelWidth:\s*(\d+)/) || [])[1]);
      const fh = Number((stdout.match(/pixelHeight:\s*(\d+)/) || [])[1]);
      const apiJpg = `${prefix}_api.jpg`;
      await sh("sips", ["-Z", "1568", "-s", "format", "jpeg", "-s", "formatOptions", "70", full, "--out", apiJpg]);

      const { articles, usage } = await callClaude(apiJpg);
      inTok += usage.input_tokens; outTok += usage.output_tokens;

      for (let a = 0; a < articles.length; a++) {
        const art = articles[a];
        if (!art?.title || !art?.body) continue;
        const idxno = nextIdx++;
        let images = [];
        let leadImage = null;
        // 사진 크롭 + R2 업로드
        if (art.photo && fw && fh) {
          const { x, y, w, h } = art.photo;
          const X = Math.max(0, Math.round(x * fw)), Y = Math.max(0, Math.round(y * fh));
          const W = Math.min(fw - X, Math.round(w * fw)), H = Math.min(fh - Y, Math.round(h * fh));
          if (W > 80 && H > 60) {
            try {
              const cropPng = `${prefix}_a${a}.png`, cropJpg = `${prefix}_a${a}.jpg`;
              await sh("pdftoppm", ["-png", "-r", "200", "-singlefile", "-x", String(X), "-y", String(Y), "-W", String(W), "-H", String(H), path, `${prefix}_a${a}`]);
              await sh("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "80", cropPng, "--out", cropJpg]);
              const key = `ebook/${date}/p${page}_a${a}.jpg`;
              await sh("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/${key}`, "--file", cropJpg, "--content-type", "image/jpeg", "--remote"]);
              leadImage = `${PHOTO_BASE}/${key}`;
              images = [leadImage];
              nPhotos++;
            } catch (e) { /* 크롭 실패 무시 */ }
          }
        }
        const body = String(art.body);
        const rec = {
          idxno, date, page,
          title: String(art.title),
          publishedAt: `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00+09:00`,
          year: Number(date.slice(0, 4)),
          section: `지면 ${page}면`,
          category: CATS.includes(art.category) ? art.category : "society",
          author: null,
          membersOnly: false,
          bodyChars: body.length,
          excerpt: body.replace(/\s+/g, " ").slice(0, 158) + "…",
          body,
          images, leadImage,
          url: null,
        };
        await appendFile(OUT_JSONL, JSON.stringify(rec) + "\n");
        nArticles++;
      }
      process.stdout.write(`\r[${i + 1}/${todo.length}] ${date} ${page}면 · 기사 ${nArticles} · 사진 ${nPhotos} · 토큰 in ${inTok} out ${outTok}   `);
    } catch (e) {
      console.log(`\n[실패 ${date} ${page}] ${e.message}`);
    }
  }

  const cost = (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT;
  console.log(`\n\n=== 완료 ===`);
  console.log(`기사 ${nArticles} · 사진 ${nPhotos} · 토큰 in ${inTok} / out ${outTok}`);
  console.log(`추정 비용 ≈ $${cost.toFixed(3)} (in $${PRICE_IN}/M, out $${PRICE_OUT}/M 기준)`);
  console.log(`출력: ${OUT_JSONL}\n→ 적재: node import-d1.mjs (단, 이 파일은 ebook용이라 JSONL 경로 확인)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
