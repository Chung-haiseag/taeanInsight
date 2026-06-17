#!/usr/bin/env node
// 지면 모드 → 기사 단위 재구조화 (Gemini, Vision 재실행 없음).
//   기존 지면 레코드의 body(=Vision OCR 텍스트)를 Gemini로 기사 분리 → 면 1건을 여러 기사로 교체.
//   지면 이미지·날짜·leadImage 그대로 유지. 표 지면(시세표·명단)은 스텁 유지.
// 사용: export GEMINI_API_KEY=...
//       node restructure-gemini.mjs 1995 1996 1997 1998 1999 2000 2001   [--conc 4] [--limit N]
//   → out/ebook_articles.jsonl 갱신 + out/restructure_delete.txt(D1에서 지울 옛 면 idxno)
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const JSONL = join(__dir, "out", "ebook_articles.jsonl");
const DELLIST = join(__dir, "out", "restructure_delete.txt");
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const CATS = ["tourism", "environment", "realestate", "policy", "industry", "culture", "society"];
const PM = /^\d{4}\.\d+\.\d+ \d+면$/;            // 지면 모드 제목
const STUB = /^\[지면 자료\]/;                    // 표 스텁

function flag(n) { return process.argv.includes(n); }
function arg(n, d) { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : d; }
const YEARS = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));
const CONC = Number(arg("--conc", "4"));
const LIMIT = Number(arg("--limit", "0"));
if (!GEMINI_KEY) { console.error("GEMINI_API_KEY 필요"); process.exit(1); }
if (!YEARS.length) { console.error("연도 인자 필요 (예: node restructure-gemini.mjs 1998)"); process.exit(1); }

// 한글 4-gram 겹침으로 충실도 측정 (지어내기·누락 감지)
const norm = (s) => (s || "").replace(/[^가-힣0-9]/g, "");
function faithfulness(body, src) {
  const a = norm(body), b = norm(src);
  if (a.length < 8) return 1;
  const grams = new Set();
  for (let i = 0; i + 4 <= b.length; i++) grams.add(b.slice(i, i + 4));
  if (!grams.size) return 1;
  let hit = 0, tot = 0;
  for (let i = 0; i + 4 <= a.length; i++) { tot++; if (grams.has(a.slice(i, i + 4))) hit++; }
  return tot ? hit / tot : 1;
}

function prompt(ocrText) {
  return `아래 [OCR]는 신문 지면을 정확히 전사한 텍스트입니다(대체로 컬럼 순서).
기사들을 구분해 JSON 배열로만 출력하세요(설명 없이 JSON만).
- body는 [OCR]의 글자(한글·한자·숫자·구두점)를 그대로 사용 — 글자를 추가/삭제/변경하거나 요약·재작성하지 마라.
- **띄어쓰기(공백)만은 한국어 맞춤법에 맞게 바로잡아라**: 컬럼 줄바꿈으로 단어 중간에 잘못 들어간 공백은 제거(예: "도약 하는"→"도약하는", "새 롭게"→"새롭게", "싱 싱한"→"싱싱한", "4 천만원"→"4천만원"), 붙어버린 단어는 띄워라. 컬럼 경계로 끊긴 문장은 자연스럽게 이어라.
- 제호(신문 머리글)·목차·판권·발행정보는 출력에서 제외.
- 광고/홍보(상품광고·슬로건·전화문의·시세표·분양안내 등)는 제외 말고 "isAd": true.
각 기사: {"title","body","category"(${CATS.join("|")}),"isAd":true/false}
[OCR]
${ocrText}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gemini(text, tries = 5) {
  let res;
  for (let t = 1; t <= tries; t++) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`, {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt(text) }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 16384, responseMimeType: "application/json" } }),
    });
    if (res.status === 429 || res.status >= 500) { if (t < tries) { await sleep(2000 * t * t); continue; } } // rate-limit/일시오류 백오프
    break;
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const out = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  const u = j.usageMetadata || {};
  let arts = [];
  try { const p = JSON.parse(out); arts = Array.isArray(p) ? p : p.articles || []; }
  catch { const m = out.match(/\[[\s\S]*\]/); if (m) try { arts = JSON.parse(m[0]); } catch {} }
  return { arts: Array.isArray(arts) ? arts : [], inTok: u.promptTokenCount || 0, outTok: u.candidatesTokenCount || 0, truncated: j.candidates?.[0]?.finishReason === "MAX_TOKENS" };
}

async function main() {
  const lines = (await readFile(JSONL, "utf8")).trim().split("\n").filter(Boolean);
  const recs = lines.map(JSON.parse);
  let nextIdx = recs.reduce((m, a) => Math.max(m, a.idxno || 0), 90000000) + 1;

  // 대상: 해당 연도의 지면 모드 레코드(스텁 제외)
  let targets = recs.filter((a) => YEARS.includes(String(a.date).slice(0, 4)) && PM.test(a.title) && !STUB.test(a.title));
  if (LIMIT) targets = targets.slice(0, LIMIT);
  const targetIdx = new Set(targets.map((a) => a.idxno));
  console.log(`재구조화 대상 면 ${targets.length} (연도 ${YEARS.join(",")}) · 동시 ${CONC} · 모델 ${GEMINI_MODEL}`);

  const newRecs = [];          // 새 기사 레코드
  const delIdx = [];           // D1에서 지울 옛 면 idxno
  let inTok = 0, outTok = 0, nArt = 0, nStub = 0, nFlag = 0, done = 0, fail = 0;

  async function handle(pg) {
    const src = pg.body || "";
    try {
      const { arts, inTok: i, outTok: o, truncated } = await gemini(src);
      inTok += i; outTok += o;
      const good = arts.filter((a) => a?.title && a?.body);
      if (!good.length || truncated) { newRecs.push(pg); process.stdout.write("·"); return; } // 분리 실패 → 면 유지
      delIdx.push(pg.idxno);     // 옛 면 레코드 교체
      for (const a of good) {
        const body = String(a.body);
        const faith = faithfulness(body, src);
        if (faith < 0.6) continue; // 너무 동떨어지면(지어냄) 버림
        if (faith < 0.75) nFlag++;
        const cat = CATS.includes(a.category) ? a.category : "society";
        newRecs.push({
          date: pg.date, page: pg.page, title: String(a.title).slice(0, 200),
          publishedAt: pg.publishedAt, year: pg.year, section: pg.section,
          category: cat, author: null, membersOnly: false,
          ocrEngine: pg.ocrEngine, faithfulness: Number(faith.toFixed(3)),
          bodyChars: body.length, excerpt: body.replace(/\s+/g, " ").slice(0, 158) + "…",
          body, images: [], leadImage: pg.leadImage, url: null,
          isAd: a.isAd === true,
          idxno: 0, // 나중에 배정
        });
        nArt++;
      }
      process.stdout.write("o");
    } catch { newRecs.push(pg); fail++; process.stdout.write("x"); }
    finally { if (++done % 50 === 0) process.stdout.write(` ${done}/${targets.length}\n`); }
  }

  let qi = 0;
  await Promise.all(Array.from({ length: Math.min(CONC, targets.length) }, async () => {
    while (qi < targets.length) await handle(targets[qi++]);
  }));

  // idxno 배정 (새 기사들)
  for (const r of newRecs) if (r.idxno === 0) r.idxno = nextIdx++;

  // 최종 JSONL = (대상 면 전체 제거) + newRecs(분리된 기사 + 분리실패로 유지한 면).
  // delIdx(성공해서 교체된 면)만 D1에서 삭제 — 유지된 면은 같은 idxno로 newRecs에 그대로 있음.
  const base = recs.filter((a) => !targetIdx.has(a.idxno));
  const finalAll = base.concat(newRecs);
  await writeFile(JSONL, finalAll.map((x) => JSON.stringify(x)).join("\n") + "\n");
  await writeFile(DELLIST, delIdx.join("\n") + "\n");

  const cost = (inTok / 1e6) * 0.30 + (outTok / 1e6) * 2.50; // gemini-2.5-flash 대략가
  console.log(`\n\n=== 재구조화 완료 ===`);
  console.log(`면 ${targets.length} → 기사 ${nArt} (교체 ${delIdx.length}면) · 분리실패/유지 ${targets.length - delIdx.length} · 오류 ${fail} · 충실도경고 ${nFlag}`);
  console.log(`토큰 in ${inTok}/out ${outTok} ≈ $${cost.toFixed(3)}`);
  console.log(`JSONL 갱신: ${finalAll.length} 레코드 · D1 삭제목록: ${DELLIST} (${delIdx.length}건)`);
  console.log(`다음: 옛 면 ${delIdx.length}건 D1 삭제 + 새 기사 적재 (publish)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
