// 오디오 뉴스 — Google Cloud TTS(ko-KR Neural2) mp3 → R2 캐시 → 스트리밍.
//  GET /api/audio/news/:idxno   (온디맨드 생성, 같은 기사는 R2에서 재사용)
//  필요 시크릿: GOOGLE_TTS_KEY (Cloud Text-to-Speech API 키). 미설정이면 503.

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";

export const audioRouter = new Hono<{ Bindings: Env }>();

const KEY = (idxno: number) => `audio/news/${idxno}-hd3.mp3`; // -hd2: Chirp3-HD + TTS 정규화(구 캐시 무효화)
const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

// 온디맨드 오디오 생성(유료 호출) 레이트리밋 — 캐시 미스 시에만 호출
function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
}
async function overAudioLimit(c: { env: Env; req: { header: (k: string) => string | undefined } }): Promise<boolean> {
  const rl = (c.env as Env & { AUDIO_RL?: import("../types").RateLimit }).AUDIO_RL;
  return rl ? !(await rl.limit({ key: `audio:${clientIp(c)}` })).success : false;
}

// TTS용 텍스트 정규화 — 기호를 자연스러운 낭독으로(가운뎃점·물결표 범위·괄호·단위)
function normalizeForTts(t: string): string {
  return t
    .replace(/(\d)\s*[~∼〜･·]\s*(\d)/g, "$1에서 $2")   // 숫자 범위(18~45, 18·45) → 에서
    .replace(/[·・‧∙•ㆍ]/g, ", ")                        // 가운뎃점 나열 → 쉼표 휴지
    .replace(/[~∼〜]/g, " ")                              // 남은 물결표 제거
    .replace(/[（(]/g, ", ").replace(/[）)]/g, ", ")      // 괄호 → 쉼표 휴지
    .replace(/(\d)\s*%/g, "$1 퍼센트")
    .replace(/㎡/g, "제곱미터").replace(/㎞/g, "킬로미터").replace(/㎏/g, "킬로그램")
    .replace(/\s*[·]\s*/g, ", ")
    .replace(/,\s*,+/g, ", ").replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1")
    .trim();
}

// 텍스트 → mp3 바이트(Google TTS Chirp3-HD). 실패 시 null.
async function googleTts(env: Env, text: string, voice = "ko-KR-Chirp3-HD-Aoede"): Promise<Uint8Array | null> {
  const apiKey = (env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text: normalizeForTts(text).slice(0, 4800) },          // Google 한도 5000자
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

// 문장 단위 청크 — Chirp3-HD는 긴 문장을 거부하므로 짧게 나눔(긴 문장은 강제 분할)
function chunkText(text: string, max = 170): string[] {
  const sents = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?。…])\s+/);
  const pieces: string[] = [];
  for (const s of sents) {
    if (s.length <= 240) { pieces.push(s); continue; }
    for (let i = 0; i < s.length; i += 200) pieces.push(s.slice(i, i + 200)); // 마침표 없는 초장문 강제 분할
  }
  const out: string[] = [];
  let buf = "";
  for (const p of pieces) {
    if ((buf + " " + p).length > max && buf) { out.push(buf); buf = p; }
    else buf = buf ? `${buf} ${p}` : p;
  }
  if (buf) out.push(buf);
  return out.filter(Boolean);
}

// 긴 텍스트 → Chirp3-HD로 문장 청크 합성 후 이어붙임(단일 화자 자연 낭독)
async function synthLong(env: Env, text: string, voice = "ko-KR-Chirp3-HD-Aoede"): Promise<Uint8Array | null> {
  const parts = chunkText(text);
  const results = await Promise.all(parts.map((p) => googleTts(env, p, voice))); // 병렬 합성(순서 유지)
  const chunks = results.filter((b): b is Uint8Array => !!b);
  if (!chunks.length) return null;
  const total = chunks.reduce((s, b) => s + b.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const b of chunks) { merged.set(b, off); off += b.length; }
  return merged;
}

// 뉴스 소식(src) → 2인 대담 대본(Workers AI) → Chirp3-HD 2보이스+무음 mp3. 브리핑 공용.
async function synthNewsPodcast(env: Env, src: string, topic: string): Promise<Uint8Array | null> {
  if (!env.AI) return null;
  let dialogue: { sp: "A" | "B"; text: string }[] = [];
  try {
    const { WorkersAiLlmClient } = await import("../llm/workers_ai");
    const client = new WorkersAiLlmClient({ ai: env.AI });
    const res = await client.complete({
      channel: "realtime", maxTokens: 900, temperature: 0.75,
      messages: [
        { role: "system", content:
          `너는 지역 라디오 팟캐스트 작가다. 아래 '${topic}'을 두 진행자의 짧은 대담으로 각색하라.\n` +
          "진행자 A(밝은 진행·질문)·B(차분한 해설)가 자연스럽게 주고받는다. 맞장구·구어체 존댓말.\n" +
          "오프닝에서 오늘 소식임을 가볍게 언급(이름·자기소개 금지). 없는 사실 창작 금지.\n" +
          "각 줄을 정확히 'A: ...' 또는 'B: ...' 로만. 14~20줄. 마지막은 짧은 마무리." },
        { role: "user", content: src },
      ],
    });
    dialogue = (res.content ?? "").split("\n").map((l) => l.trim()).map((l) => {
      const m = l.match(/^([AB])\s*[:：]\s*(.+)$/);
      return m ? { sp: m[1] as "A" | "B", text: m[2].trim().replace(/^["']|["']$/g, "") } : null;
    }).filter((x): x is { sp: "A" | "B"; text: string } => !!x && x.text.length > 1).slice(0, 22);
  } catch { /* 무시 */ }
  if (dialogue.length < 4) return null;

  const VOICE = { A: "ko-KR-Chirp3-HD-Aoede", B: "ko-KR-Chirp3-HD-Charon" } as const;
  const gap = await ttsSilence(env, 450);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < dialogue.length; i++) {
    const b = await googleTts(env, dialogue[i].text, VOICE[dialogue[i].sp]);
    if (b) chunks.push(b);
    if (gap && i < dialogue.length - 1) chunks.push(gap);
  }
  if (!chunks.length) return null;
  const total = chunks.reduce((s, b) => s + b.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const b of chunks) { merged.set(b, off); off += b.length; }
  return merged;
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

  if (!force) {
    // 로컬 잡이 올린 Gemini 멀티스피커(NotebookLM급) 우선 — 있으면 그걸 서빙
    const gem = await c.env.ARCHIVE_PHOTOS.get(`audio/podcast/${rep.week_id}-gem.wav`);
    if (gem) return new Response(gem.body, { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400" } });
    const mp3 = await c.env.ARCHIVE_PHOTOS.get(`audio/podcast/${rep.week_id}-v2.mp3`);
    if (mp3) return new Response(mp3.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
  }

  if (await overAudioLimit(c)) return c.json({ error: "rate_limited" }, 429);
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

  // 2) Chirp3-HD 2-보이스 + 줄 사이 무음 → 이어붙임
  //    (Gemini 멀티스피커는 Worker 지역차단 → 로컬 잡이 -gem.wav 업로드 시 위에서 우선 서빙)
  const VOICE = { A: "ko-KR-Chirp3-HD-Aoede", B: "ko-KR-Chirp3-HD-Charon" } as const;
  const gap = await ttsSilence(c.env, 450);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < dialogue.length; i++) {
    const b = await googleTts(c.env, dialogue[i].text, VOICE[dialogue[i].sp]);
    if (b) chunks.push(b);
    if (gap && i < dialogue.length - 1) chunks.push(gap);
  }
  if (!chunks.length) return c.json({ error: "tts_failed" }, 502);
  const total = chunks.reduce((s, b) => s + b.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const b of chunks) { merged.set(b, off); off += b.length; }

  await c.env.ARCHIVE_PHOTOS.put(`audio/podcast/${rep.week_id}-v2.mp3`, merged, { httpMetadata: { contentType: "audio/mpeg" } });
  return new Response(merged, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
}
audioRouter.get("/podcast", (c) => genPodcast(c));

// GET /api/audio/briefing — 오늘의 주요 뉴스를 2인 대담 팟캐스트로(날짜별 R2 캐시, Chirp3-HD)
audioRouter.get("/briefing", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS) return c.json({ error: "bad_request" }, 400);
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const date = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
  const cacheKey = `audio/briefing/${date}-pod.mp3`; // -pod: 2인 대담(구 단일낭독 캐시 무효화)

  const cached = await c.env.ARCHIVE_PHOTOS.get(cacheKey);
  if (cached) return new Response(cached.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=21600" } });

  if (await overAudioLimit(c)) return c.json({ error: "rate_limited" }, 429);
  if (!(c.env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY || !c.env.AI) return c.json({ error: "unconfigured" }, 503);
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);

  // 최근 주요 기사 5건(본문 충분·광고 제외)
  const since = `${new Date(Date.now() + 9 * 3600_000 - 14 * 86400_000).toISOString().slice(0, 10)}`;
  const r = await c.env.ARCHIVE_DB
    .prepare("SELECT title, substr(COALESCE(body, excerpt, ''),1,300) AS brief FROM archive_articles WHERE published_at >= ? AND length(COALESCE(body,''))>300 AND title NOT LIKE '%광고%' ORDER BY published_at DESC LIMIT 5")
    .bind(since).all<{ title: string; brief: string }>();
  const items = r.results ?? [];
  if (!items.length) return c.json({ error: "no_news" }, 404);
  const src = items.map((it) => `- ${it.title}: ${(it.brief ?? "").replace(/\s+/g, " ").trim()}`).join("\n");

  const bytes = await synthNewsPodcast(c.env, src, "오늘의 태안 주요 소식");
  if (!bytes || bytes.length < 200) return c.json({ error: "tts_failed" }, 502);
  await c.env.ARCHIVE_PHOTOS.put(cacheKey, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
  return new Response(bytes, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=21600" } });
});

// GET /api/audio/status — 오디오 자동생성 현황(로컬 잡이 기록한 status.json + 이번주 팟캐스트 존재)
audioRouter.get("/status", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS) return c.json({ error: "no_r2" }, 503);
  let status: Record<string, unknown> = {};
  try {
    const s = await c.env.ARCHIVE_PHOTOS.get("audio/status.json");
    if (s) status = await s.json();
  } catch { /* 없음 */ }
  // 이번(최신 발행) 주차 팟캐스트가 Gemini(-gem.wav)로 존재하는지
  let podcastLive = false, week = "";
  if (c.env.ARCHIVE_DB) {
    const rep = await c.env.ARCHIVE_DB.prepare("SELECT week_id FROM weekly_reports WHERE status='published' ORDER BY week_id DESC LIMIT 1").first<{ week_id: string }>();
    week = rep?.week_id ?? "";
    if (week) podcastLive = !!(await c.env.ARCHIVE_PHOTOS.head(`audio/podcast/${week}-gem.wav`));
  }
  return c.json({ ...status, podcastLive, week, checkedAt: new Date().toISOString() });
});

audioRouter.get("/news/:idxno", async (c) => {
  const idxno = Number(c.req.param("idxno"));
  if (!idxno || !c.env.ARCHIVE_PHOTOS) return c.json({ error: "bad_request" }, 400);
  const key = KEY(idxno);

  // 0) 로컬 잡이 올린 Gemini 낭독(자연 음성) 우선 — 있으면 그걸
  const gem = await c.env.ARCHIVE_PHOTOS.get(`audio/news/${idxno}-gem.wav`);
  if (gem) return new Response(gem.body, { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=604800" } });

  // 1) Chirp3-HD R2 캐시
  const cached = await c.env.ARCHIVE_PHOTOS.get(key);
  if (cached) {
    return new Response(cached.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=604800" } });
  }

  if (await overAudioLimit(c)) return c.json({ error: "rate_limited" }, 429);
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

  // 3) 생성(Chirp3-HD 문장 청크) → R2 저장
  const bytes = await synthLong(c.env, script);
  if (!bytes || bytes.length < 200) return c.json({ error: "tts_failed" }, 502);
  await c.env.ARCHIVE_PHOTOS.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
  return new Response(bytes, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=604800" } });
});
