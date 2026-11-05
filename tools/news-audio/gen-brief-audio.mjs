// '오늘의 브리핑' 낭독 생성기(로컬·한국 IP) — 1면 카드의 '브리핑 듣기'.
//
//   왜 서버에서 만드나: 전에는 브라우저 speechSynthesis(OS 음성)로 읽었다. 그런데 기기에
//   한국어 목소리가 없으면 다른 언어 목소리가 한글을 읽어, 일본어처럼 들리는 일이 실제로 있었다
//   (2026-11-05 사용자 지적). 목소리도 기계음이었다. 서버가 만든 한국어 음성 하나만 서빙하면
//   누가 어떤 기기로 듣든 같은 소리가 나고, 다른 언어로 읽힐 수가 없다.
//
//   Worker는 Gemini 지역차단 → 한국 IP 맥에서 생성해 R2 업로드(뉴스 낭독과 같은 사정).
//   흐름: /api/conditions/today-brief 의 spoken → Gemini TTS(Aoede) → mp3 → R2 audio/brief/<날짜>.mp3
//   길이는 20초 안팎이라 하루 한 번, 키 하나면 족하다.
//
//   사용: node tools/news-audio/gen-brief-audio.mjs [--force] [--out=파일] [--dry]
//     --out   R2에 올리지 않고 그 경로에 mp3만 남긴다(소리 확인용)
//     --dry   읽을 글만 출력하고 끝낸다(생성 안 함)
//     --text= 오늘 브리핑 대신 이 글을 읽는다. 목소리 고를 때만 쓰는 것이라 --out 과 함께만 받는다
//             (R2에는 늘 진짜 브리핑만 올라가야 한다).

import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ttsClean } from "../lib/tts-normalize.mjs";
import { classifyTtsFailure } from "../lib/tts-failure.mjs";
import { wavToMp3 } from "../lib/wav-to-mp3.mjs";

const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const VOICE = process.env.BRIEF_VOICE || "Aoede";        // 뉴스 낭독과 같은 목소리로 통일
const BUCKET = "taean-archive-photos";
const API_BASE = process.env.API_BASE || "https://taean-insight-api.chs9182.workers.dev";
const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");
const OUT = (process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || null;
const TEXT = (process.argv.find((a) => a.startsWith("--text=")) || "").split("=").slice(1).join("=") || null;
if (TEXT && !OUT) { console.error("--text 는 --out 과 함께만 쓴다 — R2에는 진짜 브리핑만 올린다"); process.exit(1); }

// ⚠ 말투와 언어만 적는다. '다듬어 읽어라' 같은 작업 지시는 모델을 글쓰기로 유도해 400을 낸다
//   (tools/lib/tts-failure.mjs 에 그 사고 기록이 있다).
const PROMPT = "다음 글을 한국어로, 라디오 아나운서처럼 차분하고 또렷하게 읽어 주세요:\n\n";

function loadKey() {
  const f = join(process.cwd(), "tools/news-audio/.gemini_keys");
  if (existsSync(f)) {
    const k = readFileSync(f, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
    if (k.length) return k[0];
  }
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  throw new Error("키 없음: tools/news-audio/.gemini_keys 또는 GEMINI_API_KEY");
}

function wrangler(args, opts = {}) {
  return execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", maxBuffer: 64 << 20, ...opts });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function kstDate() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
}

function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function tts(key, text) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${key}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT + ttsClean(text) }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
        }),
      });
    } catch (e) { console.warn(`  오류: ${e.message} 재시도 ${attempt}/3`); await sleep(1500); continue; }
    if (!res.ok) {
      // ⚠ 오류 본문을 반드시 남긴다 — 상태 코드만 있는 로그는 진단이 아니다(2026-09-05 교훈).
      let why = ""; try { why = (JSON.parse(await res.text()).error?.message ?? "").slice(0, 200); } catch { /* 본문 없음 */ }
      const kind = classifyTtsFailure(res.status, why);
      console.warn(`  ${res.status} ${kind} — ${why || "(본문 없음)"}`);
      if (kind === "skip" || kind === "exhausted") return null;
      await sleep(1500); continue;
    }
    const j = await res.json();
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) { console.warn("  오디오 없음 재시도"); await sleep(1500); continue; }
    const pcm = Buffer.from(part.inlineData.data, "base64");
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1] ?? 24000);
    return pcmToWav(pcm, rate);
  }
  return null;
}

async function main() {
  const date = kstDate();
  const key = `audio/brief/${date}.mp3`;

  let spoken = TEXT ?? "";
  if (!TEXT) {
    const res = await fetch(`${API_BASE}/api/conditions/today-brief`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) { console.error(`브리핑 조회 실패 ${res.status}`); process.exit(1); }
    const brief = await res.json();
    spoken = (brief?.spoken ?? "").trim();
  }
  if (!spoken) { console.error("읽을 글 없음(spoken 비어 있음) — 생성하지 않는다"); process.exit(1); }
  console.log(`[${date}] 읽을 글: ${spoken}`);
  if (DRY) return;

  if (!OUT && !FORCE) {
    const probe = await fetch(`${API_BASE}/api/audio/brief`, { method: "HEAD" }).catch(() => null);
    if (probe?.ok) { console.log("오늘 것 이미 있음 — --force 로 다시 만들 수 있다"); return; }
  }

  const wav = await tts(loadKey(), spoken);
  if (!wav) { console.error("생성 실패 — 오늘 음성 없음(듣기 단추는 '준비 중'으로 표시된다)"); process.exit(1); }
  const mp3 = wavToMp3(wav);
  console.log(`  mp3 ${(mp3.length / 1024).toFixed(0)}KB`);

  if (OUT) { writeFileSync(OUT, mp3); console.log(`로컬 저장: ${OUT}`); return; }

  const tmp = join(tmpdir(), `brief-${date}.mp3`);
  writeFileSync(tmp, mp3);
  try {
    wrangler(["r2", "object", "put", `${BUCKET}/${key}`, "--file", tmp, "--content-type", "audio/mpeg", "--remote"]);
    console.log(`업로드: ${key}`);
  } finally { rmSync(tmp, { force: true }); }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
