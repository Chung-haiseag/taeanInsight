// 오디오 뉴스 — Google Cloud TTS(ko-KR Neural2) mp3 → R2 캐시 → 스트리밍.
//  GET /api/audio/news/:idxno   (온디맨드 생성, 같은 기사는 R2에서 재사용)
//  필요 시크릿: GOOGLE_TTS_KEY (Cloud Text-to-Speech API 키). 미설정이면 503.

import { Hono } from "hono";
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

// GET /api/audio/podcast — 주간 리포트로 2인 대담 AI 팟캐스트(주차별 R2 캐시)
//  진행자 수아(여, Neural2-A) · 해설자 준호(남, Neural2-C). 대본은 Workers AI, 음성은 줄마다 번갈아 합성→이어붙임.
audioRouter.get("/podcast", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS || !c.env.ARCHIVE_DB) return c.json({ error: "bad_request" }, 400);
  // 최신 발행 리포트
  const rep = await c.env.ARCHIVE_DB
    .prepare("SELECT week_id, summary, substr(sections,1,4000) AS sections FROM weekly_reports WHERE status='published' ORDER BY week_id DESC LIMIT 1")
    .first<{ week_id: string; summary: string; sections: string }>();
  if (!rep) return c.json({ error: "no_report" }, 404);
  const cacheKey = `audio/podcast/${rep.week_id}.mp3`;

  const cached = await c.env.ARCHIVE_PHOTOS.get(cacheKey);
  if (cached) return new Response(cached.body, { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=86400" } });

  if (!(c.env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY || !c.env.AI) return c.json({ error: "unconfigured" }, 503);

  // 1) 대본 생성(2인 대화체)
  let dialogue: { sp: "A" | "B"; text: string }[] = [];
  try {
    const { WorkersAiLlmClient } = await import("../llm/workers_ai");
    const client = new WorkersAiLlmClient({ ai: c.env.AI });
    const src = `${rep.summary}\n\n${(rep.sections ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2500)}`;
    const res = await client.complete({
      channel: "realtime", maxTokens: 900, temperature: 0.5,
      messages: [
        { role: "system", content:
          "너는 지역신문 팟캐스트 작가다. 아래 '이번 주 태안 소식'을 두 진행자의 자연스러운 대담으로 각색하라.\n" +
          "- 진행자 A=수아(밝게 진행·질문), B=준호(차분히 해설). 구어체·존댓말.\n" +
          "- 형식: 각 줄을 'A: ...' 또는 'B: ...' 로만. 16~20줄. 인사로 시작, 마무리 인사로 끝.\n" +
          "- 소식에 없는 사실을 지어내지 말고, 핵심을 쉽게 풀어 대화하라. 수치·인용은 자연스럽게." },
        { role: "user", content: src },
      ],
    });
    dialogue = (res.content ?? "").split("\n").map((l) => l.trim()).map((l) => {
      const m = l.match(/^([AB])\s*[:：]\s*(.+)$/);
      return m ? { sp: m[1] as "A" | "B", text: m[2].trim() } : null;
    }).filter((x): x is { sp: "A" | "B"; text: string } => !!x && x.text.length > 1).slice(0, 22);
  } catch { /* 무시 */ }
  if (dialogue.length < 4) return c.json({ error: "script_failed" }, 502);

  // 2) 줄마다 음성 합성(A=여/B=남) → 바이트 이어붙임
  const VOICE = { A: "ko-KR-Neural2-A", B: "ko-KR-Neural2-C" } as const;
  const chunks: Uint8Array[] = [];
  for (const line of dialogue) {
    const b = await googleTts(c.env, line.text, VOICE[line.sp]);
    if (b) chunks.push(b);
  }
  if (!chunks.length) return c.json({ error: "tts_failed" }, 502);
  const total = chunks.reduce((s, b) => s + b.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const b of chunks) { merged.set(b, off); off += b.length; }

  await c.env.ARCHIVE_PHOTOS.put(cacheKey, merged, { httpMetadata: { contentType: "audio/mpeg" } });
  return new Response(merged, { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=86400" } });
});

// GET /api/audio/briefing — 오늘의 주요 뉴스를 한 편의 음성 브리핑으로(날짜별 R2 캐시)
audioRouter.get("/briefing", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS) return c.json({ error: "bad_request" }, 400);
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const date = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
  const cacheKey = `audio/briefing/${date}.mp3`;

  const cached = await c.env.ARCHIVE_PHOTOS.get(cacheKey);
  if (cached) return new Response(cached.body, { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=21600" } });

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
  return new Response(bytes, { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=21600" } });
});

audioRouter.get("/news/:idxno", async (c) => {
  const idxno = Number(c.req.param("idxno"));
  if (!idxno || !c.env.ARCHIVE_PHOTOS) return c.json({ error: "bad_request" }, 400);
  const key = KEY(idxno);

  // 1) R2 캐시 우선
  const cached = await c.env.ARCHIVE_PHOTOS.get(key);
  if (cached) {
    return new Response(cached.body, { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=604800" } });
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
  return new Response(bytes, { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=604800" } });
});
