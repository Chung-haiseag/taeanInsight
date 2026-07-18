// 주요 기사 Gemini 낭독 생성기(로컬·한국 IP) — 팟캐스트급 자연 음성, 무료.
//   Worker는 Gemini 지역차단 → 한국 IP 맥에서 생성해 R2 업로드.
//   무료 키 3개(victory·holyroad·taeannews) 로테이션 → 하루 ~45건 무료. 소진 시 중단(나머지는 Worker Chirp3-HD 폴백).
//
//   키: tools/news-audio/.gemini_keys (한 줄에 하나, 무료 등급 키) — chmod 600
//   사용: node tools/news-audio/gen-news-audio.mjs [--max=24] [--force]
//   업로드: audio/news/<idxno>-gem2.wav  (Worker가 있으면 우선 서빙)

import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ttsClean as normalize } from "../lib/tts-normalize.mjs";

const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const BUCKET = "taean-archive-photos";
const MAX = Number((process.argv.find((a) => a.startsWith("--max=")) || "--max=45").split("=")[1]);
const FORCE = process.argv.includes("--force");
const PER_KEY = Number(process.env.PER_KEY || "15"); // 키당 하루 안전 상한

// 무료 키 로드(.gemini_keys 우선, 없으면 팟캐스트 키 재사용)
function loadKeys() {
  const f = "tools/news-audio/.gemini_keys";
  if (existsSync(f)) return readFileSync(f, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  if (process.env.GEMINI_API_KEY) return [process.env.GEMINI_API_KEY];
  if (existsSync("tools/podcast/.gemini_key")) return [readFileSync("tools/podcast/.gemini_key", "utf8").trim()];
  throw new Error("키 없음: tools/news-audio/.gemini_keys 에 무료 키(victory·holyroad·taeannews) 한 줄씩");
}
const KEYS = loadKeys();
const used = KEYS.map(() => 0); // 키별 사용량
let ki = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wrangler(args, opts = {}) {
  return execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", maxBuffer: 64 << 20, ...opts });
}
function d1(sql) { return JSON.parse(wrangler(["d1", "execute", "taean-archive", "--remote", "--json", "--command", sql]))[0]?.results ?? []; }

// 생성 현황을 R2 audio/status.json 에 병합 기록(Worker /api/audio/status 가 노출)
function writeStatus(patch) {
  let cur = {};
  try { cur = JSON.parse(wrangler(["r2", "object", "get", `${BUCKET}/audio/status.json`, "--remote", "--pipe"], { stdio: ["ignore", "pipe", "ignore"] })); } catch { /* 최초 */ }
  const tmp = join(tmpdir(), "audio-status.json");
  writeFileSync(tmp, JSON.stringify({ ...cur, ...patch }));
  try { wrangler(["r2", "object", "put", `${BUCKET}/audio/status.json`, "--file", tmp, "--content-type", "application/json", "--remote"]); }
  catch { /* 무시 */ } finally { rmSync(tmp, { force: true }); }
}

function r2Has(key) {
  try { wrangler(["r2", "object", "get", `${BUCKET}/${key}`, "--remote", "--pipe"], { stdio: ["ignore", "ignore", "ignore"] }); return true; }
  catch { return false; }
}

const exhausted = new Set(); // 429/한도 도달 키
const keyAvail = (i) => !exhausted.has(i) && used[i] < PER_KEY;
const allExhausted = () => KEYS.every((_, i) => !keyAvail(i));

async function ttsOnce(key, text) {
  // TTS 프리뷰 모델은 systemInstruction 미지원(500). 인라인 스타일 지시만 사용.
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `다음 뉴스 기사를 아나운서처럼 차분하고 또렷하게 읽어줘. 띄어쓰기가 어색한 부분은 자연스럽게 교정해서 읽되 내용은 그대로 둬:\n\n${normalize(text)}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } } },
    }),
  });
  return res;
}

// 키 로테이션 단일화자 TTS. 반환: {audio} | {skip} (이 기사만 실패) | {exhausted} (전 키 소진)
async function geminiTts(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // 사용 가능한 키 선택
    let hop = 0;
    while (hop < KEYS.length && !keyAvail(ki)) { ki = (ki + 1) % KEYS.length; hop++; }
    if (!keyAvail(ki)) return { exhausted: true };
    try {
      const res = await ttsOnce(KEYS[ki], text);
      if (res.status === 429) { console.warn(`  키#${ki + 1} 429 일일한도 도달`); exhausted.add(ki); ki = (ki + 1) % KEYS.length; continue; } // 한도 → 다음 키
      if (!res.ok) { console.warn(`  키#${ki + 1} ${res.status} 재시도`); await sleep(1200); continue; } // 일시 오류 → 재시도
      const j = await res.json();
      const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part) { console.warn(`  키#${ki + 1} 오디오 없음 재시도`); await sleep(1200); continue; }
      used[ki]++;
      const pcm = Buffer.from(part.inlineData.data, "base64");
      const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1] ?? 24000);
      return { audio: pcmToWav(pcm, rate) };
    } catch (e) { console.warn(`  키#${ki + 1} 오류: ${e.message} 재시도`); await sleep(1200); }
  }
  return { skip: true }; // 3회 실패 → 이 기사만 스킵(키는 유지)
}

function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function main() {
  console.log(`▸ 무료 키 ${KEYS.length}개 · 키당 상한 ${PER_KEY} · 최대 ${MAX}건`);
  // 최신 주요 기사(본문 충분·광고 제외) 최신순 — 최신 MAX개
  const rows = d1(`SELECT idxno, title, substr(COALESCE(body, excerpt, ''),1,1500) AS body FROM archive_articles
    WHERE published_at >= date('now','-60 day') AND length(COALESCE(body,''))>300 AND title NOT LIKE '%광고%'
    ORDER BY published_at DESC, idxno DESC LIMIT ${MAX}`);
  console.log(`  대상 ${rows.length}건`);
  let done = 0, skip = 0, fail = 0;
  for (const a of rows) {
    const key = `audio/news/${a.idxno}-gem2.wav`;
    if (!FORCE && r2Has(key)) { skip++; continue; }
    const script = `${a.title}.\n${(a.body || "").replace(/\s+/g, " ").trim()}`;
    const r = await geminiTts(script);
    if (r.exhausted) { console.log(`  ⚠ 무료 한도 소진 — 나머지는 Chirp3-HD 폴백. (생성 ${done})`); break; }
    if (r.skip) { fail++; console.log(`  ⤼ ${a.idxno} 건너뜀(TTS 반복 오류) — Chirp3-HD 폴백`); continue; }
    const tmp = join(tmpdir(), `news-${a.idxno}.wav`);
    writeFileSync(tmp, r.audio);
    try { wrangler(["r2", "object", "put", `${BUCKET}/${key}`, "--file", tmp, "--content-type", "audio/wav", "--remote"]); }
    finally { rmSync(tmp, { force: true }); }
    done++;
    console.log(`  ✅ ${a.idxno} ${a.title.slice(0, 24)} (${(r.audio.length / 1024).toFixed(0)}KB)`);
    await sleep(1500); // rate 여유
  }
  console.log(`완료 — 생성 ${done} · 스킵(이미있음) ${skip} · 실패건너뜀 ${fail} · 키사용 ${used.join("/")}`);
  writeStatus({ news: { generated: done, skipped: skip, failed: fail, target: rows.length, at: new Date().toISOString() } });
}
main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
