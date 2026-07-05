// 저녁 뉴스 브리핑 생성기(로컬·한국 IP) — Gemini 멀티스피커(NotebookLM급).
//   Worker는 Gemini 지역차단이라 못 함 → 한국 IP(VPS/맥)에서 생성해 R2 업로드.
//   흐름: D1 최근 주요기사 5건 → Gemini 2인 대담 대본 → Gemini 멀티스피커 TTS(WAV) → R2.
//   업로드 키: audio/briefing/<날짜(KST)>-gem.wav  (Worker가 있으면 우선 서빙)
//   사용: GEMINI_API_KEY=... node tools/podcast/gen-briefing.mjs [--force]

import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 키: .gemini_keys(뉴스낭독과 공유) 첫 줄 우선, 없으면 GEMINI_API_KEY env
function loadKey() {
  const f = join(process.cwd(), "tools/news-audio/.gemini_keys");
  if (existsSync(f)) {
    const k = readFileSync(f, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
    if (k.length) return k[0];
  }
  return process.env.GEMINI_API_KEY;
}
const KEY = loadKey();
if (!KEY) { console.error("GEMINI_API_KEY 필요"); process.exit(1); }
const TEXT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const BUCKET = "taean-archive-photos";
const FORCE = process.argv.includes("--force");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function wrangler(args, opts = {}) {
  return execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", maxBuffer: 64 << 20, ...opts });
}
function d1(sql) {
  const out = wrangler(["d1", "execute", "taean-archive", "--remote", "--json", "--command", sql]);
  return JSON.parse(out)[0]?.results ?? [];
}
// KST 오늘 날짜(Worker 캐시키와 동일 계산)
function kstDate() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
}

async function gemini(model, body, attempt = 0) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`gemini ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  } catch (e) {
    if (attempt < 3) { await sleep(2000 * (attempt + 1)); return gemini(model, body, attempt + 1); }
    throw e;
  }
}

// 2인 대담 대본 — 저녁 브리핑(주간보다 짧고 가볍게)
async function makeDialogue(src) {
  const sys =
    "너는 따뜻한 지역 라디오의 '저녁 뉴스 브리핑' 작가다. 아래 오늘의 태안 주요 소식을 두 진행자의 진짜 대화처럼 각색하라.\n" +
    "진행자 A: 밝고 호기심 많은 메인 진행자(질문·반응). 진행자 B: 차분한 해설자(배경·의미).\n" +
    "- 진짜 대화처럼 짧게 주고받고 맞장구(\"그렇군요\",\"맞아요\")·연결어 사용. 한 줄 1~2문장.\n" +
    "- 딱딱한 보도체 금지, 쉬운 구어체 존댓말. 진행자 이름·호칭·자기소개 절대 금지.\n" +
    "- 오프닝은 이름 없이 '오늘 저녁 태안 소식' 정도로 가볍게 시작, 클로징은 짧은 인사.\n" +
    "- 주어진 소식만 다루고 없는 사실 창작 금지. 소식마다 1~2회 주고받으며 자연 전환.\n" +
    "- 각 줄을 정확히 'A: ...' 또는 'B: ...' 로만. 16~24줄(간결하게).";
  const j = await gemini(TEXT_MODEL, {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ parts: [{ text: src }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 1800, thinkingConfig: { thinkingBudget: 0 } },
  });
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  const lines = text.split("\n").map((l) => l.trim())
    .map((l) => { const m = l.match(/^([AB])\s*[:：]\s*(.+)$/); return m ? { sp: m[1], text: m[2].trim().replace(/^["']|["']$/g, "") } : null; })
    .filter((x) => x && x.text.length > 1).slice(0, 26);
  if (lines.length < 4) throw new Error("대본 생성 실패");
  return lines;
}

async function synthesize(dialogue) {
  const transcript = dialogue.map((d) => `${d.sp === "A" ? "Speaker1" : "Speaker2"}: ${d.text}`).join("\n");
  const j = await gemini(TTS_MODEL, {
    contents: [{ parts: [{ text: `다음 두 진행자의 저녁 라디오 브리핑을 자연스럽고 생동감 있게 읽어줘:\n\n${transcript}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: [
        { speaker: "Speaker1", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
        { speaker: "Speaker2", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } },
      ] } },
    },
  });
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error("오디오 응답 없음");
  const pcm = Buffer.from(part.inlineData.data, "base64");
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1] ?? 24000);
  return pcmToWav(pcm, rate);
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
  const date = kstDate();
  const key = `audio/briefing/${date}-gem.wav`;
  console.log(`▸ 저녁 브리핑 ${date}`);

  if (!FORCE) {
    try { wrangler(["r2", "object", "get", `${BUCKET}/${key}`, "--remote", "--pipe"], { stdio: ["ignore", "ignore", "ignore"] }); console.log("이미 존재 — 스킵(--force로 재생성)"); return; }
    catch { /* 없음 → 생성 */ }
  }

  // 최근 14일 주요 기사 5건 — Worker /briefing과 동일 소스
  const since = new Date(Date.now() + 9 * 3600_000 - 14 * 86400_000).toISOString().slice(0, 10);
  const items = d1(`SELECT title, substr(COALESCE(body, excerpt, ''),1,300) AS brief FROM archive_articles WHERE published_at >= '${since}' AND length(COALESCE(body,''))>300 AND title NOT LIKE '%광고%' ORDER BY published_at DESC, idxno DESC LIMIT 5`);
  if (!items.length) { console.log("대상 기사 없음 — 종료"); return; }
  const src = items.map((it) => `- ${it.title}: ${(it.brief || "").replace(/\s+/g, " ").trim()}`).join("\n");
  console.log(`  소스 기사 ${items.length}건`);

  console.log("▸ 대본 생성(Gemini)…");
  const dialogue = await makeDialogue(src);
  console.log(`  ${dialogue.length}줄`);

  console.log("▸ 멀티스피커 음성 합성(Gemini)…");
  const wav = await synthesize(dialogue);
  console.log(`  ${(wav.length / 1024).toFixed(0)}KB`);

  const tmp = join(tmpdir(), `briefing-${date}.wav`);
  writeFileSync(tmp, wav);
  try {
    console.log(`▸ R2 업로드 → ${key}`);
    wrangler(["r2", "object", "put", `${BUCKET}/${key}`, "--file", tmp, "--content-type", "audio/wav", "--remote"]);
    console.log("✅ 완료 — 저녁 브리핑이 NotebookLM급으로 교체됩니다.");
    try {
      let cur = {};
      try { cur = JSON.parse(wrangler(["r2", "object", "get", `${BUCKET}/audio/status.json`, "--remote", "--pipe"], { stdio: ["ignore", "pipe", "ignore"] })); } catch { /* 최초 */ }
      const stmp = join(tmpdir(), "audio-status.json");
      writeFileSync(stmp, JSON.stringify({ ...cur, briefing: { date, ok: true, at: new Date().toISOString() } }));
      try { wrangler(["r2", "object", "put", `${BUCKET}/audio/status.json`, "--file", stmp, "--content-type", "application/json", "--remote"]); } finally { rmSync(stmp, { force: true }); }
    } catch { /* 무시 */ }
  } finally { rmSync(tmp, { force: true }); }
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
