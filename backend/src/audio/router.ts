// 오디오 뉴스 — Google Cloud TTS(ko-KR Neural2) mp3 → R2 캐시 → 스트리밍.
//  GET /api/audio/news/:idxno   (온디맨드 생성, 같은 기사는 R2에서 재사용)
//  필요 시크릿: GOOGLE_TTS_KEY (Cloud Text-to-Speech API 키). 미설정이면 503.

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";

export const audioRouter = new Hono<{ Bindings: Env }>();

const KEY = (idxno: number) => `audio/news/${idxno}.mp3`;
const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

// 텍스트 → mp3 바이트(Google TTS Neural2). 실패 시 null.
async function googleTts(env: Env, text: string, voice = "ko-KR-Neural2-A"): Promise<Uint8Array | null> {
  const apiKey = (env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text: text.slice(0, 4800) },          // Google 한도 5000자
        voice: { languageCode: "ko-KR", name: voice },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { audioContent?: string };
    if (!j.audioContent) return null;
    const bin = atob(j.audioContent);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// 짧은 무음 mp3(줄 사이 자연스러운 쉼 + 바이트 이음새를 무음에 숨김). Neural2 SSML break.
async function ttsSilence(env: Env, ms = 500): Promise<Uint8Array | null> {
  const apiKey = (env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { ssml: `<speak><break time="${ms}ms"/></speak>` },
        voice: { languageCode: "ko-KR", name: "ko-KR-Neural2-A" },
        audioConfig: { audioEncoding: "MP3" },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { audioContent?: string };
    if (!j.audioContent) return null;
    const bin = atob(j.audioContent);
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  } catch { return null; }
}

// 원시 PCM(L16) → WAV 컨테이너(브라우저 재생용)
function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const numCh = 1, bps = 16, dataSize = pcm.length;
  const buf = new Uint8Array(44 + dataSize);
  const dv = new DataView(buf.buffer);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); dv.setUint32(4, 36 + dataSize, true); ws(8, "WAVE");
  ws(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, numCh, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * numCh * bps / 8, true);
  dv.setUint16(32, numCh * bps / 8, true); dv.setUint16(34, bps, true);
  ws(36, "data"); dv.setUint32(40, dataSize, true); buf.set(pcm, 44);
  return buf;
}

// Gemini 멀티스피커 TTS(NotebookLM급) — 대본→2인 자연 대담 음성(WAV). 키 없으면 null.
async function geminiPodcastTts(env: Env, dialogue: { sp: "A" | "B"; text: string }[]): Promise<Uint8Array | null> {
  const key = (env as Env & { GEMINI_API_KEY?: string }).GEMINI_API_KEY;
  if (!key) return null;
  const transcript = dialogue.map((d) => `${d.sp === "A" ? "Speaker1" : "Speaker2"}: ${d.text}`).join("\n");
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${key}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `다음 두 진행자의 라디오 대담을 자연스럽고 생동감 있게 읽어줘:\n\n${transcript}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: [
            { speaker: "Speaker1", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
            { speaker: "Speaker2", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } },
          ] } },
        },
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const b64 = part?.inlineData?.data;
    if (!b64) return null;
    const bin = atob(b64);
    const pcm = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
    const rate = Number(part?.inlineData?.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
    return pcmToWav(pcm, rate);
  } catch { return null; }
}

// GET /api/audio/podcast — 주간 리포트로 2인 대담 AI 팟캐스트(주차별 R2 캐시)
//  진행자 수아(여, Neural2-A) · 해설자 준호(남, Neural2-C). 대본은 Workers AI, 음성은 줄마다 번갈아 합성→이어붙임.
async function genPodcast(c: Context<{ Bindings: Env }>, force = false) {
  if (!c.env.ARCHIVE_PHOTOS || !c.env.ARCHIVE_DB) return c.json({ error: "bad_request" }, 400);
  // 최신 발행 리포트
  const rep = await c.env.ARCHIVE_DB
    .prepare("SELECT week_id, summary, substr(sections,1,4000) AS sections FROM weekly_reports WHERE status='published' ORDER BY week_id DESC LIMIT 1")
    .first<{ week_id: string; summary: string; sections: string }>();
  if (!rep) return c.json({ error: "no_report" }, 404);
  // 엔진: GEMINI_API_KEY 있으면 멀티스피커(WAV), 없으면 Chirp3-HD(MP3)
  const useGemini = !!(c.env as Env & { GEMINI_API_KEY?: string }).GEMINI_API_KEY;
  const cacheKey = useGemini ? `audio/podcast/${rep.week_id}-gem.wav` : `audio/podcast/${rep.week_id}-v2.mp3`;
  const ctype = useGemini ? "audio/wav" : "audio/mpeg";

  if (!force) {
    const cached = await c.env.ARCHIVE_PHOTOS.get(cacheKey);
    if (cached) return new Response(cached.body, { headers: { "content-type": ctype, "cache-control": "private, max-age=86400" } });
  }

  if (!(c.env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY || !c.env.AI) return c.json({ error: "unconfigured" }, 503);

  // 1) 대본 생성(2인 대화체) — 자연스러운 라디오 대담
  let dialogue: { sp: "A" | "B"; text: string }[] = [];
  try {
    const { WorkersAiLlmClient } = await import("../llm/workers_ai");
    const client = new WorkersAiLlmClient({ ai: c.env.AI });
    const src = `${rep.summary}\n\n${(rep.sections ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2500)}`;
    const res = await client.complete({
      channel: "realtime", maxTokens: 1100, temperature: 0.75,
      messages: [
        { role: "system", content:
          "너는 따뜻한 지역 라디오 팟캐스트 작가다. 아래 '이번 주 태안 소식'을 두 진행자의 진짜 대화처럼 각색하라.\n" +
          "진행자 A: 밝고 호기심 많은 메인 진행자. 질문을 던지고 청취자 입장에서 반응한다(\"오, 그래요?\", \"그게 왜 중요한가요?\").\n" +
          "진행자 B: 차분하고 사려 깊은 해설자. 배경과 의미를 쉽게 풀어준다.\n" +
          "작성 규칙:\n" +
          "- 진짜 대화처럼: 짧게 주고받고, 가끔 맞장구(\"맞아요\", \"그렇죠\")와 자연스러운 연결어를 써라. 한 줄은 1~2문장으로 짧게.\n" +
          "- 딱딱한 보도체 금지. 친구에게 설명하듯 쉬운 구어체 존댓말.\n" +
          "- 진행자 이름·호칭·자기소개를 절대 쓰지 마라(서로를 이름으로 부르지 않는다).\n" +
          "- 오프닝: 이름 소개 없이 바로 이번 주 주제를 가볍게 안내. 클로징: 짧게 마무리 인사.\n" +
          "- 소식에 없는 사실을 지어내지 마라. 핵심 1~3가지를 깊이 있게 다뤄라.\n" +
          "- 형식: 각 줄을 정확히 'A: ...' 또는 'B: ...' 로만 출력. 18~24줄." },
        { role: "user", content: src },
      ],
    });
    dialogue = (res.content ?? "").split("\n").map((l) => l.trim()).map((l) => {
      const m = l.match(/^([AB])\s*[:：]\s*(.+)$/);
      return m ? { sp: m[1] as "A" | "B", text: m[2].trim().replace(/^["']|["']$/g, "") } : null;
    }).filter((x): x is { sp: "A" | "B"; text: string } => !!x && x.text.length > 1).slice(0, 26);
  } catch { /* 무시 */ }
  if (dialogue.length < 4) return c.json({ error: "script_failed" }, 502);

  // 2) 음성 합성 — Gemini 멀티스피커(한 번에) 우선, 실패/무키 시 Chirp3-HD(이어붙임)
  let merged: Uint8Array | null = null;
  if (useGemini) merged = await geminiPodcastTts(c.env, dialogue);
  if (!merged) {
    const VOICE = { A: "ko-KR-Chirp3-HD-Aoede", B: "ko-KR-Chirp3-HD-Charon" } as const;
    const gap = await ttsSilence(c.env, 450);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < dialogue.length; i++) {
      const b = await googleTts(c.env, dialogue[i].text, VOICE[dialogue[i].sp]);
      if (b) chunks.push(b);
      if (gap && i < dialogue.length - 1) chunks.push(gap);
    }
    if (chunks.length) {
      const total = chunks.reduce((s, b) => s + b.length, 0);
      merged = new Uint8Array(total);
      let off = 0;
      for (const b of chunks) { merged.set(b, off); off += b.length; }
    }
  }
  if (!merged || merged.length < 200) return c.json({ error: "tts_failed" }, 502);

  // Gemini 실패로 MP3 폴백이면 키/타입 보정
  const isWav = merged.length > 4 && merged[0] === 0x52 && merged[1] === 0x49; // "RI"
  const outKey = isWav ? `audio/podcast/${rep.week_id}-gem.wav` : `audio/podcast/${rep.week_id}-v2.mp3`;
  const outType = isWav ? "audio/wav" : "audio/mpeg";
  await c.env.ARCHIVE_PHOTOS.put(outKey, merged, { httpMetadata: { contentType: outType } });
  return new Response(merged, { headers: { "content-type": outType, "cache-control": "private, max-age=86400" } });
}
audioRouter.get("/podcast", (c) => genPodcast(c));

// GET /api/audio/briefing — 오늘의 주요 뉴스를 한 편의 음성 브리핑으로(날짜별 R2 캐시)
audioRouter.get("/briefing", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS) return c.json({ error: "bad_request" }, 400);
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const date = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
  const cacheKey = `audio/briefing/${date}.mp3`;

  const cached = await c.env.ARCHIVE_PHOTOS.get(cacheKey);
  if (cached) return new Response(cached.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=21600" } });

  if (!(c.env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY) return c.json({ error: "tts_unconfigured" }, 503);
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);

  // 최근 3일 주요 기사 5건(본문 충분·광고 제외)
  const since = `${new Date(Date.now() + 9 * 3600_000 - 14 * 86400_000).toISOString().slice(0, 10)}`;
  const r = await c.env.ARCHIVE_DB
    .prepare("SELECT title, substr(COALESCE(excerpt, body, ''),1,140) AS brief FROM archive_articles WHERE published_at >= ? AND length(COALESCE(body,''))>300 AND title NOT LIKE '%광고%' ORDER BY published_at DESC LIMIT 5")
    .bind(since).all<{ title: string; brief: string }>();
  const items = r.results ?? [];
  if (!items.length) return c.json({ error: "no_news" }, 404);

  const ord = ["첫 번째", "두 번째", "세 번째", "네 번째", "다섯 번째"];
  const lines = items.map((it, i) => `${ord[i] ?? `${i + 1}번째`} 소식. ${it.title}. ${(it.brief ?? "").replace(/\s+/g, " ").trim()}`);
  const script = `태안 인사이트 오늘의 뉴스 브리핑입니다. 오늘의 주요 소식 ${items.length}건을 전해드립니다.\n${lines.join("\n")}\n이상 태안 인사이트 브리핑이었습니다. 자세한 내용은 태안뉴스에서 확인하세요.`;

  const bytes = await googleTts(c.env, script);
  if (!bytes || bytes.length < 200) return c.json({ error: "tts_failed" }, 502);
  await c.env.ARCHIVE_PHOTOS.put(cacheKey, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
  return new Response(bytes, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=21600" } });
});

audioRouter.get("/news/:idxno", async (c) => {
  const idxno = Number(c.req.param("idxno"));
  if (!idxno || !c.env.ARCHIVE_PHOTOS) return c.json({ error: "bad_request" }, 400);
  const key = KEY(idxno);

  // 1) R2 캐시 우선
  const cached = await c.env.ARCHIVE_PHOTOS.get(key);
  if (cached) {
    return new Response(cached.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=604800" } });
  }

  if (!(c.env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY) {
    return c.json({ error: "tts_unconfigured", hint: "GOOGLE_TTS_KEY 미설정" }, 503);
  }
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);

  // 2) 기사 텍스트(제목 + 발췌) — '오디오 브리핑'
  const row = await c.env.ARCHIVE_DB
    .prepare("SELECT title, substr(COALESCE(body, excerpt, ''),1,1500) AS snippet FROM archive_articles WHERE idxno=?")
    .bind(idxno).first<{ title: string; snippet: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  const script = `${row.title}.\n${(row.snippet ?? "").replace(/\s+/g, " ").trim()}`;

  // 3) 생성 → R2 저장
  const bytes = await googleTts(c.env, script);
  if (!bytes || bytes.length < 200) return c.json({ error: "tts_failed" }, 502);
  await c.env.ARCHIVE_PHOTOS.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
  return new Response(bytes, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=604800" } });
});
