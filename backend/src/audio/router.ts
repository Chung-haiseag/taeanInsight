// 오디오 뉴스(MVP) — 기사 텍스트 → Workers AI MeloTTS(한국어) mp3 → R2 캐시 → 스트리밍.
//  GET /api/audio/news/:idxno  (온디맨드 생성, 같은 기사는 R2에서 재사용)

import { Hono } from "hono";
import type { Env } from "../types";

export const audioRouter = new Hono<{ Bindings: Env }>();

const KEY = (idxno: number) => `audio/news/${idxno}.wav`;

// MeloTTS 응답을 mp3 바이트로 — {audio: base64} | ArrayBuffer | ReadableStream 방어적 처리
async function ttsToBytes(env: Env, text: string): Promise<Uint8Array | null> {
  if (!env.AI) return null;
  try {
    const out = (await env.AI.run("@cf/myshell-ai/melotts" as never, { prompt: text.slice(0, 800), lang: "ko" } as never)) as unknown;
    if (out && typeof out === "object" && "audio" in out) {
      const b64 = (out as { audio: string }).audio;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    if (out instanceof ArrayBuffer) return new Uint8Array(out);
    if (out instanceof ReadableStream) return new Uint8Array(await new Response(out).arrayBuffer());
    return null;
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
    return new Response(cached.body, { headers: { "content-type": "audio/wav", "cache-control": "public, max-age=86400" } });
  }

  // 2) 기사 텍스트(제목 + 발췌) — 짧은 '오디오 브리핑'
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const row = await c.env.ARCHIVE_DB
    .prepare("SELECT title, substr(COALESCE(excerpt, body, ''),1,500) AS snippet FROM archive_articles WHERE idxno=?")
    .bind(idxno).first<{ title: string; snippet: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  const script = `${row.title}. ${(row.snippet ?? "").replace(/\s+/g, " ").trim()}`;

  // 3) TTS 생성 → R2 저장
  const bytes = await ttsToBytes(c.env, script);
  if (!bytes || bytes.length < 100) return c.json({ error: "tts_failed" }, 502);
  await c.env.ARCHIVE_PHOTOS.put(key, bytes, { httpMetadata: { contentType: "audio/wav" } });
  return new Response(bytes, { headers: { "content-type": "audio/wav", "cache-control": "public, max-age=86400" } });
});
