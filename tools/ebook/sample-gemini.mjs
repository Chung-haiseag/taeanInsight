#!/usr/bin/env node
// Gemini 기사분리 품질 샘플 — 기존 지면 모드 텍스트(1998 등)를 Gemini로 기사 단위 분리해 미리보기.
//   파이프라인·D1·JSONL 안 건드림. 품질 확인용.
// 사용: export GEMINI_API_KEY=...   node sample-gemini.mjs [YYYYMMDD] [면수]
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const JSONL = join(__dir, "out", "ebook_articles.jsonl");
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const CATS = ["tourism", "environment", "realestate", "policy", "industry", "culture", "society"];

if (!GEMINI_KEY) { console.error("GEMINI_API_KEY 필요 (https://aistudio.google.com/ 무료 발급)"); process.exit(1); }

function prompt(ocrText) {
  return `아래 [OCR]는 신문 지면을 정확히 전사한 텍스트입니다(대체로 컬럼 순서).
기사들을 구분해 JSON 배열로만 출력하세요(설명 없이 JSON만).
- body는 [OCR] 글자를 그대로 사용. 맞춤법·요약·재작성 금지. (컬럼으로 끊긴 문장 잇기, 단어 중간 공백 제거는 허용, 단 글자 변경 금지)
- 제호·목차·판권·발행정보는 제외. 광고는 제외 말고 "isAd": true.
각 기사: {"title","body","category"(${CATS.join("|")}),"isAd":true/false}
[OCR]
${ocrText}`;
}

async function gemini(text) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt(text) }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 16384, responseMimeType: "application/json" } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const out = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  const u = j.usageMetadata || {};
  let arts = [];
  try { const p = JSON.parse(out); arts = Array.isArray(p) ? p : p.articles || []; } catch { const m = out.match(/\[[\s\S]*\]/); arts = m ? JSON.parse(m[0]) : []; }
  return { arts, inTok: u.promptTokenCount || 0, outTok: u.candidatesTokenCount || 0 };
}

const date = process.argv[2] || "19981225";
const nPages = Number(process.argv[3] || "2");
const all = (await readFile(JSONL, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
const pages = all.filter((a) => a.date === date).slice(0, nPages);
if (!pages.length) { console.error(`${date} 지면을 JSONL에서 못 찾음`); process.exit(1); }

let inTok = 0, outTok = 0;
for (const pg of pages) {
  console.log(`\n========== ${pg.date} ${pg.page}면 — Gemini 기사분리 ==========`);
  const { arts, inTok: i, outTok: o } = await gemini(pg.body);
  inTok += i; outTok += o;
  console.log(`→ ${arts.length}개 기사로 분리됨`);
  arts.forEach((a, k) => {
    console.log(`\n  [${k + 1}] ${a.isAd ? "(광고) " : ""}${a.title}  <${a.category}>`);
    console.log(`      ${String(a.body || "").slice(0, 140).replace(/\n/g, " ")}…`);
  });
}
const cost = (inTok / 1e6) * 0.10 + (outTok / 1e6) * 0.40;
console.log(`\n=== ${pages.length}면 처리 · 토큰 in ${inTok}/out ${outTok} ≈ $${cost.toFixed(4)} (Gemini Flash) ===`);
console.log(`전체 5,600면 추정: ≈ $${(cost / pages.length * 5600).toFixed(2)}`);
