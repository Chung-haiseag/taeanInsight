#!/usr/bin/env node
// 옛 지면의 **광고만** 되살린다 — 1990~1994년 박스광고가 통째로 빠져 있다.
//
//   왜 빠졌나: 디지털화 지시문이 "광고는 제외"였고, 그 시절(Gemini 멀티모달)엔 지시가 잘 지켜졌다.
//     1995~2001년은 지시가 안 지켜져 광고가 대량으로 남았다 — 지금 '옛 광고' 12,461건은 그 실수 덕이다.
//   실물 확인: 1990-11-26 1면 하단에 '(주)궁전침대·동양가구' 박스광고(전화·취급품목·약도)가 그대로 있다.
//     매 호 12면 × 170호 ≈ 2,000면, 면마다 1~2개 → 광고 2,000~4,000건이 묻혀 있다.
//
//   ⚠ **기존 기사는 손대지 않는다.** 기사를 갈아끼우면 번호가 바뀌어 주소 9,215개와
//     인물 언급 10,375건이 끊긴다. 광고만 **새로 추가**한다 — 그러면 위험이 없다.
//     (본문 품질 개선은 별개 결정으로 미룬다.)
//
//   자료: 지면 이미지는 R2 공개 경로에서 받는다(원본 PDF는 이미 없다).
//     ⚠ R2본은 1800px로, 처음 디지털화 때 쓴 2400px보다 낮다. 그래서 mediaResolution=HIGH로
//       올려 보낸다(실측: 입력 토큰 600 → 3,696으로 늘며 세부가 살아났다).
//
//   사용:
//     export GEMINI_API_KEY=...
//     node tools/ebook/ads-backfill.mjs --years 1990,1991 --limit 5   # 맛보기
//     node tools/ebook/ads-backfill.mjs --years 1990,1991,1992,1993,1994
//   적재:
//     npx wrangler d1 execute taean-archive --remote --file tools/ebook/out/ads-backfill.sql

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "out");
const SQL_OUT = join(OUT_DIR, "ads-backfill.sql");
const CKPT = join(OUT_DIR, "ads-backfill-progress.json");
const LOG = join(OUT_DIR, "ads-backfill.log");
const API = process.env.TAEAN_API ?? "https://taean-insight-api.chs9182.workers.dev";
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const YEARS = (arg("--years", "1990,1991,1992,1993,1994")).split(",").map(Number).filter(Boolean);
const LIMIT = Number(arg("--limit", 0)) || 0;
const CONC = Number(arg("--conc", 4)) || 4;
/** 새 기사 번호 시작점. 기존 최대(90,048,664) 위로 넉넉히 띄운다 — 겹치면 기존 기사를 덮는다. */
const IDX_START = Number(arg("--idx-start", 90060001));

if (!KEY) { console.error("GEMINI_API_KEY 가 없습니다."); process.exit(1); }
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const log = (m) => { console.log(m); appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sqlStr = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const squeeze = (s) => String(s ?? "").replace(/[^가-힣0-9a-zA-Z]/g, "");

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

// 광고만 뽑는 전용 지시문 — 기사는 이미 D1에 있으니 다시 뽑지 않는다.
const PROMPT = `이 이미지는 1990년대 한국 지역신문(태안신문) 지면입니다. 세로쓰기와 한자가 섞여 있습니다.
이 지면에 실린 **광고만** 빠짐없이 찾아 JSON 배열로 출력하세요(설명 없이 JSON만).

광고란: 상품·업소 광고, 축하광고, 분양·매물, 구인, 개업 인사, 시세표, 협찬 안내처럼
**돈을 내고 실은 것**입니다. 지면 하단의 박스광고를 특히 빠뜨리지 마세요.
기사(기자가 쓴 소식)·사설·칼럼·독자투고·제호·판권은 담지 마세요.

각 광고: {"title": "업체명 또는 광고 표제", "body": "광고에 적힌 글을 그대로 전사(전화번호·주소·취급품목·대표자명 포함)"}
- 글자를 **정확히 전사**하라 — 요약·창작 금지. 한자는 원문 그대로.
- 판독 불가 글자는 □ 로 표기.
- 광고가 없으면 빈 배열 [] 을 출력.`;

async function gemini(imgB64) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: imgB64 } }] }],
      generationConfig: {
        temperature: 0.1, maxOutputTokens: 16384, responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },          // 기계적 전사 — 사고 끔(프로젝트 방침)
        mediaResolution: "MEDIA_RESOLUTION_HIGH",       // 1800px 이미지의 세부를 살린다
      },
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Gemini: ${String(j.error.message).slice(0, 120)}`);
  const c = j.candidates?.[0];
  if (c?.finishReason && c.finishReason !== "STOP") throw new Error(`Gemini finish=${c.finishReason}`);
  const txt = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  try { return JSON.parse(txt); } catch { throw new Error("JSON 파싱 실패"); }
}

// ── 대상 지면 모으기 ───────────────────────────────────────────────────────
const ckpt = existsSync(CKPT) ? JSON.parse(readFileSync(CKPT, "utf-8")) : { done: {}, nextIdx: IDX_START };
const saveCkpt = () => writeFileSync(CKPT, JSON.stringify(ckpt));
if (!ckpt.nextIdx) ckpt.nextIdx = IDX_START;

log(`지면 목록 읽는 중… (${YEARS.join(", ")})`);
const targets = [];
for (const y of YEARS) {
  const { issues = [] } = await (await get(`${API}/api/archive/papers/${y}`)).json();
  for (const it of issues) for (const p of it.pages) targets.push({ year: y, date: it.date, no: p.no });
}
let todo = targets.filter((t) => !ckpt.done[`${t.date}#${t.no}`]);
if (LIMIT) todo = todo.slice(0, LIMIT);
log(`대상 ${targets.length}면 · 이번에 처리할 ${todo.length}면`);

let found = 0, dup = 0, failed = 0, pagesDone = 0;
const lines = [];

async function onePage(t) {
  // 이미 그 면에 있는 제목 — 같은 광고를 두 번 넣지 않는다(1993·1994엔 일부가 이미 있다).
  const { articles = [] } = await (await get(`${API}/api/archive/papers/${t.year}/${t.date}/${t.no}`)).json();
  const seen = new Set(articles.map((a) => squeeze(a.title)).filter(Boolean));

  const ymd = t.date.replace(/-/g, "");
  const img = Buffer.from(await (await get(
    `${API}/api/archive/photo/ebook/${ymd}/page_${String(t.no).padStart(2, "0")}full.jpg`)).arrayBuffer());
  const ads = await gemini(img.toString("base64"));
  if (!Array.isArray(ads)) return;

  for (const a of ads) {
    const title = String(a?.title ?? "").trim();
    const body = String(a?.body ?? "").trim();
    if (!title || body.length < 4) continue;
    if (seen.has(squeeze(title))) { dup++; continue; }
    seen.add(squeeze(title));

    const idxno = ckpt.nextIdx++;
    const excerpt = body.replace(/\s+/g, " ").slice(0, 158);
    lines.push(
      "INSERT OR IGNORE INTO archive_articles" +
      "(idxno,title,published_at,year,section,category,author,excerpt,body,images,lead_image,members_only,url,is_ad,faithfulness) VALUES (" +
      [
        idxno, sqlStr(title), sqlStr(`${t.date}T00:00:00+09:00`), t.year,
        sqlStr(`지면 ${String(t.no).padStart(2, "0")}면`), sqlStr("society"), "NULL",
        sqlStr(excerpt), sqlStr(body), sqlStr("[]"),
        sqlStr(`${API}/api/archive/photo/ebook/${ymd}/page_${String(t.no).padStart(2, "0")}.jpg`),
        0, "NULL", 1, 1,
      ].join(",") + ");",
    );
    found++;
  }
}

for (let i = 0; i < todo.length; i += CONC) {
  await Promise.all(todo.slice(i, i + CONC).map(async (t) => {
    try { await onePage(t); ckpt.done[`${t.date}#${t.no}`] = 1; }
    catch (e) { failed++; log(`✗ ${t.date} ${t.no}면 — ${e instanceof Error ? e.message : e}`); }
    finally { pagesDone++; }
  }));
  saveCkpt();
  if (lines.length) appendFileSync(SQL_OUT, lines.splice(0).join("\n") + "\n");
  if (pagesDone % 40 < CONC) log(`…${pagesDone}/${todo.length}면 · 광고 ${found} · 중복 ${dup} · 실패 ${failed}`);
}

log(`\n── 요약 ──\n광고 ${found}건 · 중복 ${dup}건 · 실패 ${failed}면 → ${SQL_OUT}`);
log(`번호 대역 ${IDX_START}~${ckpt.nextIdx - 1}`);
log(`적재: npx wrangler d1 execute taean-archive --remote --file ${SQL_OUT}`);
