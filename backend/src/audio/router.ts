// 오디오 뉴스 — Google Cloud TTS(ko-KR Neural2) mp3 → R2 캐시 → 스트리밍.
//  GET /api/audio/news/:idxno   (온디맨드 생성, 같은 기사는 R2에서 재사용)
//  필요 시크릿: GOOGLE_TTS_KEY (Cloud Text-to-Speech API 키). 미설정이면 503.

import { Hono } from "hono";
import type { Env } from "../types";

export const audioRouter = new Hono<{ Bindings: Env }>();

const KEY = (idxno: number) => `audio/news/${idxno}.mp3`;
const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

// 텍스트 → mp3 바이트(Google TTS Neural2). 실패 시 null.
async function googleTts(env: Env, text: string): Promise<Uint8Array | null> {
  const apiKey = (env as Env & { GOOGLE_TTS_KEY?: string }).GOOGLE_TTS_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text: text.slice(0, 4800) },          // Google 한도 5000자
        voice: { languageCode: "ko-KR", name: "ko-KR-Neural2-A" },
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
