// 주간 AI 팟캐스트 생성기(로컬·한국 IP) — Gemini 멀티스피커(NotebookLM급).
//   Worker는 Gemini API 지역차단이라 못 함 → 한국 IP 맥에서 생성해 R2로 업로드.
//   흐름: D1 최신 발행 리포트 → Gemini 텍스트로 2인 대담 대본 → Gemini 멀티스피커 TTS(WAV) → R2 업로드.
//
//   필요 env: GEMINI_API_KEY  (디지털화와 동일 키)
//   사용: GEMINI_API_KEY=... node tools/podcast/gen-podcast.mjs [--force]
//   업로드 키: audio/podcast/<주차>-gem.wav  (Worker가 있으면 우선 서빙)

import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 필요 (export GEMINI_API_KEY=...)"); process.exit(1); }
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

// 1) 최신 발행 리포트(D1)
function latestReport() {
  const rows = d1("SELECT week_id, summary, sections FROM weekly_reports WHERE status='published' ORDER BY week_id DESC LIMIT 1;");
  if (!rows.length) throw new Error("발행된 리포트 없음");
  return rows[0];
}

// 군정 소식·카드뉴스·행사일정(최근) + 한 주간 주요 뉴스 — /reports 화면과 동일 소스
function recentGov(n = 8) {
  return d1(`SELECT title, dept FROM gov_notices ORDER BY published_at DESC LIMIT ${n};`);
}
function weeklyNews(n = 8) {
  return d1(`SELECT title FROM archive_articles WHERE length(COALESCE(body,''))>300 ORDER BY published_at DESC LIMIT ${n};`);
}

async function gemini(model, body, attempt = 0) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`gemini ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return await res.json();
  } catch (e) {
    if (attempt < 3) { await sleep(2000 * (attempt + 1)); return gemini(model, body, attempt + 1); }
    throw e;
  }
}

// 2) 2인 대담 대본 (이름·자기소개 없음 — Worker 프롬프트와 동일 취지)
async function makeDialogue(src) {
  const sys =
    "너는 따뜻한 지역 라디오 팟캐스트 작가다. 아래 '이번 주 태안 소식(주간 리포트 전체)'을 두 진행자의 진짜 대화처럼 각색하라.\n" +
    "진행자 A: 밝고 호기심 많은 메인 진행자(질문·반응). 진행자 B: 차분한 해설자(배경·의미).\n" +
    "- 진짜 대화처럼 짧게 주고받고 맞장구(\"맞아요\",\"그렇죠\")·연결어 사용. 한 줄 1~2문장.\n" +
    "- 딱딱한 보도체 금지, 쉬운 구어체 존댓말. 진행자 이름·호칭·자기소개 절대 금지.\n" +
    "- 오프닝은 이름 없이 바로 오늘 다룰 내용 소개, 클로징은 짧은 마무리 인사.\n" +
    "- 소식에 없는 사실 창작 금지.\n" +
    "- ★중요: 리포트의 '모든 섹션'을 빠짐없이 순서대로 다뤄라(요약/관광·기상, 부동산·지역경제, 다음주 이벤트, 환경 모니터링, 군정 소식·카드뉴스·행사일정, 한 주간 주요 뉴스). 섹션마다 최소 2~3번 주고받으며 자연스럽게 화제를 전환(\"다음은 ~ 소식인데요\").\n" +
    "- 각 줄을 정확히 'A: ...' 또는 'B: ...' 로만. 28~40줄(전 섹션을 다 담되 각 주제는 간결히).";
  const j = await gemini(TEXT_MODEL, {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ parts: [{ text: src }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 2800, thinkingConfig: { thinkingBudget: 0 } },
  });
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  const lines = text.split("\n").map((l) => l.trim())
    .map((l) => { const m = l.match(/^([AB])\s*[:：]\s*(.+)$/); return m ? { sp: m[1], text: m[2].trim().replace(/^["']|["']$/g, "") } : null; })
    .filter((x) => x && x.text.length > 1).slice(0, 44);
  if (lines.length < 4) throw new Error("대본 생성 실패");
  return lines;
}

// 3) 멀티스피커 TTS → PCM(L16) → WAV
async function synthesize(dialogue) {
  const transcript = dialogue.map((d) => `${d.sp === "A" ? "Speaker1" : "Speaker2"}: ${d.text}`).join("\n");
  const j = await gemini(TTS_MODEL, {
    contents: [{ parts: [{ text: `다음 두 진행자의 라디오 대담을 자연스럽고 생동감 있게 읽어줘:\n\n${transcript}` }] }],
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
  const rep = latestReport();
  const key = `audio/podcast/${rep.week_id}-gem.wav`;
  console.log(`▸ 주차 ${rep.week_id}`);

  if (!FORCE) {
    try { wrangler(["r2", "object", "get", `${BUCKET}/${key}`, "--remote", "--pipe"], { stdio: ["ignore", "ignore", "ignore"] }); console.log("이미 존재 — 스킵(--force로 재생성)"); return; }
    catch { /* 없음 → 생성 */ }
  }

  const sections = JSON.parse(rep.sections || "[]");
  const gov = recentGov();
  const news = weeklyNews();
  const secText = sections.map((s) => `[${s.title || s.key}]\n${s.content || ""}`).join("\n\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").slice(0, 6000);
  const govText = gov.length ? `\n\n[군정 소식·카드뉴스·행사일정]\n${gov.map((g) => `- ${g.title}${g.dept ? ` (${g.dept})` : ""}`).join("\n")}` : "";
  const newsText = news.length ? `\n\n[한 주간 주요 뉴스]\n${news.map((n) => `- ${n.title}`).join("\n")}` : "";
  const src = `${rep.summary}\n\n${secText}${govText}${newsText}`;
  console.log(`  소스: 섹션 ${sections.length} · 군정 ${gov.length} · 뉴스 ${news.length}`);

  console.log("▸ 대본 생성(Gemini)…");
  const dialogue = await makeDialogue(src);
  console.log(`  ${dialogue.length}줄`);

  console.log("▸ 멀티스피커 음성 합성(Gemini)…");
  const wav = await synthesize(dialogue);
  console.log(`  ${(wav.length / 1024).toFixed(0)}KB`);

  const tmp = join(tmpdir(), `podcast-${rep.week_id}.wav`);
  writeFileSync(tmp, wav);
  try {
    console.log(`▸ R2 업로드 → ${key}`);
    wrangler(["r2", "object", "put", `${BUCKET}/${key}`, "--file", tmp, "--content-type", "audio/wav", "--remote"]);
    console.log("✅ 완료 — /reports 팟캐스트가 NotebookLM급으로 교체됩니다.");
    // 현황 기록(Worker /api/audio/status)
    try {
      let cur = {};
      try { cur = JSON.parse(wrangler(["r2", "object", "get", `${BUCKET}/audio/status.json`, "--remote", "--pipe"], { stdio: ["ignore", "pipe", "ignore"] })); } catch { /* 최초 */ }
      const stmp = join(tmpdir(), "audio-status.json");
      writeFileSync(stmp, JSON.stringify({ ...cur, podcast: { week: rep.week_id, ok: true, at: new Date().toISOString() } }));
      try { wrangler(["r2", "object", "put", `${BUCKET}/audio/status.json`, "--file", stmp, "--content-type", "application/json", "--remote"]); } finally { rmSync(stmp, { force: true }); }
    } catch { /* 무시 */ }
  } finally { rmSync(tmp, { force: true }); }
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
