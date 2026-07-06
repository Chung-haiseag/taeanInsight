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

// 2인 대담 대본 — 저녁 뉴스 브리핑(3분 이내: 군정·신문·외부보도 종합)
async function makeDialogue(src) {
  const sys =
    "너는 따뜻한 지역 라디오의 '오늘 저녁 태안 뉴스' 진행 대본 작가다. 아래 오늘자 태안 소식(군정·태안신문·외부 언론보도)을 두 진행자의 진짜 대화처럼 각색하라.\n" +
    "진행자 A: 밝고 호기심 많은 메인 진행자(질문·반응). 진행자 B: 차분한 해설자(배경·의미).\n" +
    "- 진짜 대화처럼 짧게 주고받고 맞장구(\"그렇군요\",\"맞아요\")·연결어 사용. 한 줄 1~2문장.\n" +
    "- 딱딱한 보도체 금지, 쉬운 구어체 존댓말. 진행자 이름·호칭·자기소개 절대 금지.\n" +
    "- 오프닝은 이름 없이 '오늘 저녁 태안 소식' 정도로 가볍게. 클로징은 '오늘 준비한 소식은 여기까지입니다' 정도로 아주 짧게(마지막 날짜 마무리 멘트는 자동으로 붙으니 날짜를 직접 말하지 말 것).\n" +
    "- 세 갈래(군정 소식 → 지역 주요 기사 → 외부 언론이 본 태안)를 자연스럽게 전환하며 다뤄라. 중요한 것 위주로 추리고, 비슷한 소식은 묶어라.\n" +
    "- 주어진 소식만 다루고 없는 사실 창작 금지. 외부 보도는 '한 매체 보도에 따르면' 식으로 출처를 가볍게 언급.\n" +
    "- ★분량 제한: 전체 낭독이 3분을 넘지 않게 22~26줄, 총 950자 이내로 간결하게.\n" +
    "- 각 줄을 정확히 'A: ...' 또는 'B: ...' 로만.";
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

  // 오늘 저녁 뉴스 소스 3갈래 — 최근성 우선 + 어제 다룬 항목 제외(매일 다른 브리핑)
  const clean = (s) => (s || "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/g, " ").replace(/\s+/g, " ").trim();
  const norm = (t) => clean(t).slice(0, 44);
  // 최근 브리핑에서 다룬 제목 로드(중복 회피). 최대 2일치 롤링.
  let coveredPrev = new Set();
  try {
    const prev = JSON.parse(wrangler(["r2", "object", "get", `${BUCKET}/audio/briefing/covered.json`, "--remote", "--pipe"], { stdio: ["ignore", "pipe", "pipe"] }));
    // FORCE 재실행 시 오늘 저장분으로 자기오염 방지(같은 날 재생성이 스스로를 dedup)
    if (!(FORCE && prev.date === date)) (prev.titles || []).forEach((t) => coveredPrev.add(norm(t)));
  } catch (e) {
    // 객체 없음(최초)은 정상. 그 외 오류는 dedup을 조용히 끄지 말고 경고(다음날 중복 위험 인지).
    const err = String((e && (e.stderr || e.message)) || e);
    if (!/not exist|not found|NoSuchKey|404|could not be found/i.test(err)) console.warn("⚠ covered.json 로드 실패(중복방지 약화):", err.slice(0, 120));
  }
  const fresh = (arr) => arr.filter((x) => !coveredPrev.has(norm(x.title)));
  // 최근 창 우선 → 신선분이 min 미만이면 넓은 창으로 보강(둘 다 어제 것 제외)
  const pick = (recentSql, wideSql, min) => { let r = fresh(d1(recentSql)); if (r.length < min) r = fresh(d1(wideSql)); return r; };

  const gov = pick(
    `SELECT title, dept FROM gov_notices WHERE fetched_at >= datetime('now','-40 hours') ORDER BY published_at DESC LIMIT 30`,
    `SELECT title, dept FROM gov_notices WHERE fetched_at >= datetime('now','-4 day') ORDER BY published_at DESC LIMIT 30`, 2).slice(0, 3);
  const news = pick(
    `SELECT title, substr(COALESCE(body, excerpt, ''),1,220) AS brief FROM archive_articles WHERE published_at >= date('now','+9 hours','-40 hours') AND length(COALESCE(body,''))>300 AND title NOT LIKE '%광고%' ORDER BY published_at DESC, idxno DESC LIMIT 30`,
    `SELECT title, substr(COALESCE(body, excerpt, ''),1,220) AS brief FROM archive_articles WHERE published_at >= date('now','+9 hours','-4 day') AND length(COALESCE(body,''))>300 AND title NOT LIKE '%광고%' ORDER BY published_at DESC, idxno DESC LIMIT 30`, 1).slice(0, 4);
  const clips = pick(
    `SELECT title, source, substr(COALESCE(description,''),1,140) AS brief FROM news_clips WHERE created_at >= datetime('now','-30 hours') AND source NOT LIKE '%태안신문%' GROUP BY title ORDER BY pub_date DESC, id DESC LIMIT 30`,
    `SELECT title, source, substr(COALESCE(description,''),1,140) AS brief FROM news_clips WHERE created_at >= datetime('now','-3 day') AND source NOT LIKE '%태안신문%' GROUP BY title ORDER BY pub_date DESC, id DESC LIMIT 30`, 2).slice(0, 3);

  const parts = [];
  if (gov.length) parts.push(`[오늘의 군정 소식]\n${gov.map((g) => `- ${clean(g.title)}${g.dept ? ` (${g.dept})` : ""}`).join("\n")}`);
  if (news.length) parts.push(`[태안신문 주요 기사]\n${news.map((n) => `- ${clean(n.title)}: ${clean(n.brief)}`).join("\n")}`);
  if (clips.length) parts.push(`[외부 언론이 본 태안]\n${clips.map((c) => `- [${clean(c.source)}] ${clean(c.title)}${c.brief ? `: ${clean(c.brief)}` : ""}`).join("\n")}`);
  if (!parts.length) { console.log("새 소식 없음(어제와 중복 제외 후) — 종료"); return; }
  const src = parts.join("\n\n");
  const coveredNow = [...gov, ...news, ...clips].map((x) => x.title);
  console.log(`  소스: 군정 ${gov.length} · 신문 ${news.length} · 외부 ${clips.length} (어제 다룬 ${coveredPrev.size}건 제외)`);

  console.log("▸ 대본 생성(Gemini)…");
  const dialogue = await makeDialogue(src);
  // 마지막 멘트: 날짜 마무리(정확한 날짜로 고정)
  const dateKo = date.replace(/(\d+)-(\d+)-(\d+)/, (_, y, m, d) => `${y}년 ${+m}월 ${+d}일`);
  dialogue.push({ sp: "B", text: `${dateKo} 저녁 태안 소식이었습니다.` });
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
    // 오늘 다룬 항목 저장 → 내일 중복 회피(최근 2일 롤링 유지)
    try {
      const rolled = [...coveredNow, ...coveredPrev].slice(0, 24);
      const ctmp = join(tmpdir(), "briefing-covered.json");
      writeFileSync(ctmp, JSON.stringify({ date, titles: rolled }));
      try { wrangler(["r2", "object", "put", `${BUCKET}/audio/briefing/covered.json`, "--file", ctmp, "--content-type", "application/json", "--remote"]); } finally { rmSync(ctmp, { force: true }); }
    } catch { /* 무시 */ }
    try {
      let cur = {};
      try { cur = JSON.parse(wrangler(["r2", "object", "get", `${BUCKET}/audio/status.json`, "--remote", "--pipe"], { stdio: ["ignore", "pipe", "ignore"] })); } catch { /* 최초 */ }
      const stmp = join(tmpdir(), "audio-status.json");
      writeFileSync(stmp, JSON.stringify({ ...cur, briefing: { date, ok: true, at: new Date().toISOString() } }));
      try { wrangler(["r2", "object", "put", `${BUCKET}/audio/status.json`, "--file", stmp, "--content-type", "application/json", "--remote"]); } finally { rmSync(stmp, { force: true }); }
    } catch (e) { console.warn("⚠ covered.json 저장 실패(내일 중복 가능):", String(e).slice(0, 120)); }
  } finally { rmSync(tmp, { force: true }); }
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
