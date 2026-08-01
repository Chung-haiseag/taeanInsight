// 오디오 뉴스/브리핑/팟캐스트 — 로컬·VPS 잡이 R2에 올린 Gemini 낭독(.wav)만 서빙.
//  Gemini본이 없으면 503(no_audio) — Chirp3-HD(Google Cloud TTS 유료) 폴백은 비활성(2026-07-27).
//  GET /api/audio/news/:idxno · /briefing · /podcast · /status · /manifest

import { Hono } from "hono";
import type { Env } from "../types";
import { aggregateManifest, podcastWeekIds } from "./manifest";

export const audioRouter = new Hono<{ Bindings: Env }>();

// R2 오디오 서빙 — Range 요청 지원(<audio> 스트리밍·seek에 필수). 파일 없으면 null(다음 후보로).
//   Range 없으면 전체 + content-length + accept-ranges. Range 있으면 206 부분 응답.
async function serveAudio(
  bucket: R2Bucket, key: string, contentType: string, cacheControl: string, rangeHeader: string | null | undefined,
): Promise<Response | null> {
  const m = rangeHeader ? /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (m) {
    const head = await bucket.head(key);
    if (!head) return null;
    const size = head.size;
    const start = parseInt(m[1], 10);
    const end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start <= end && start < size) {
      const obj = await bucket.get(key, { range: { offset: start, length: end - start + 1 } });
      if (obj) return new Response(obj.body, { status: 206, headers: {
        "content-type": contentType, "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": String(end - start + 1), "accept-ranges": "bytes", "cache-control": cacheControl } });
    }
  }
  const obj = await bucket.get(key);
  if (!obj) return null;
  return new Response(obj.body, { headers: {
    "content-type": contentType, "content-length": String(obj.size), "accept-ranges": "bytes", "cache-control": cacheControl } });
}

// GET /api/audio/podcast — 최신 발행 주간 리포트의 Gemini 멀티스피커 낭독(-gem.wav)만 서빙. 없으면 503.
audioRouter.get("/podcast", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS || !c.env.ARCHIVE_DB) return c.json({ error: "bad_request" }, 400);
  const rep = await c.env.ARCHIVE_DB
    .prepare("SELECT week_id FROM weekly_reports WHERE status='published' ORDER BY week_id DESC LIMIT 1")
    .first<{ week_id: string }>();
  if (!rep) return c.json({ error: "no_report" }, 404);
  const cc = "private, max-age=86400", rh = c.req.header("range");
  const r = (await serveAudio(c.env.ARCHIVE_PHOTOS, `audio/podcast/${rep.week_id}-gem.mp3`, "audio/mpeg", cc, rh))
    ?? (await serveAudio(c.env.ARCHIVE_PHOTOS, `audio/podcast/${rep.week_id}-gem.wav`, "audio/wav", cc, rh));
  return r ?? c.json({ error: "no_audio", hint: "Gemini 낭독 미생성(Chirp3-HD 폴백 비활성)" }, 503);
});

// GET /api/audio/podcast/episodes — 팟캐스트(-gem)가 있는 발행 주간 리포트 회차 목록(다시듣기).
//   R2 audio/podcast/ 목록에서 주차 집합을 뽑아 발행 리포트와 교집합. (:weekId 라우트보다 먼저 등록)
audioRouter.get("/podcast/episodes", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS || !c.env.ARCHIVE_DB) return c.json({ episodes: [] });
  const keys: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const res = await c.env.ARCHIVE_PHOTOS.list({ prefix: "audio/podcast/", cursor, limit: 1000 });
    for (const o of res.objects) keys.push(o.key);
    if (!res.truncated) break;
    cursor = res.cursor;
  }
  const have = podcastWeekIds(keys);
  const rows = await c.env.ARCHIVE_DB
    .prepare("SELECT week_id, published_at, summary FROM weekly_reports WHERE status='published' ORDER BY week_id DESC LIMIT 40")
    .all<{ week_id: string; published_at: string; summary: string }>();
  const episodes = (rows.results ?? [])
    .filter((r) => have.has(r.week_id))
    .map((r) => ({ weekId: r.week_id, publishedAt: r.published_at, summary: r.summary ?? "" }));
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ episodes });
});

// GET /api/audio/podcast/:weekId — 특정 주차 팟캐스트(-gem) 서빙(다시듣기). weekId는 ISO 주차 형식만.
audioRouter.get("/podcast/:weekId{[0-9]{4}-W[0-9]{2}}", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS) return c.json({ error: "bad_request" }, 400);
  const weekId = c.req.param("weekId");
  const cc = "private, max-age=86400", rh = c.req.header("range");
  const r = (await serveAudio(c.env.ARCHIVE_PHOTOS, `audio/podcast/${weekId}-gem.mp3`, "audio/mpeg", cc, rh))
    ?? (await serveAudio(c.env.ARCHIVE_PHOTOS, `audio/podcast/${weekId}-gem.wav`, "audio/wav", cc, rh));
  return r ?? c.json({ error: "no_audio", hint: "Gemini 낭독 미생성(Chirp3-HD 폴백 비활성)" }, 503);
});

// GET /api/audio/briefing — 당일(KST) Gemini 브리핑(-gem.wav)만 서빙. 없으면 503.
audioRouter.get("/briefing", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS) return c.json({ error: "bad_request" }, 400);
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const date = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
  const cc = "private, max-age=600, must-revalidate", rh = c.req.header("range");
  const r = (await serveAudio(c.env.ARCHIVE_PHOTOS, `audio/briefing/${date}-gem.mp3`, "audio/mpeg", cc, rh))
    ?? (await serveAudio(c.env.ARCHIVE_PHOTOS, `audio/briefing/${date}-gem.wav`, "audio/wav", cc, rh));
  return r ?? c.json({ error: "no_audio", hint: "Gemini 낭독 미생성(Chirp3-HD 폴백 비활성)" }, 503);
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

// GET /api/audio/manifest — R2 오디오 파일 포맷별 집계(관리자, 읽기 전용). 저품질·구버전 정리용.
//   헤더 X-Admin-Token = ADMIN_TOKEN. ?prefix= (기본 audio/news/), ?keys=1 이면 포맷별 키 목록도 반환.
audioRouter.get("/manifest", async (c) => {
  const env = c.env as Env & { ADMIN_TOKEN?: string };
  if (!env.ADMIN_TOKEN || c.req.header("X-Admin-Token") !== env.ADMIN_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }
  if (!c.env.ARCHIVE_PHOTOS) return c.json({ error: "no_r2" }, 503);
  const bucket = c.env.ARCHIVE_PHOTOS; // 클로저/루프에서 narrowing 유지
  const prefix = c.req.query("prefix") || "audio/news/";
  const withKeys = c.req.query("keys") === "1";

  const keys: string[] = [];
  let cursor: string | undefined;
  // R2 list 페이지네이션(1000/page). 안전 상한 200페이지(=20만 오브젝트).
  for (let i = 0; i < 200; i++) {
    const res = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const o of res.objects) keys.push(o.key);
    if (!res.truncated) break;
    cursor = res.cursor;
  }

  const m = aggregateManifest(keys);
  return c.json({
    prefix,
    total: m.total,
    byFormat: m.byFormat,
    ...(withKeys ? { keysByFormat: m.keysByFormat } : {}),
  });
});

// GET /api/audio/news/:idxno — 기사별 Gemini 낭독(-gem2.wav)만 서빙. 없으면 503.
audioRouter.get("/news/:idxno", async (c) => {
  const idxno = Number(c.req.param("idxno"));
  if (!idxno || !c.env.ARCHIVE_PHOTOS) return c.json({ error: "bad_request" }, 400);
  const cc = "private, max-age=604800", rh = c.req.header("range");
  const r = (await serveAudio(c.env.ARCHIVE_PHOTOS, `audio/news/${idxno}-gem2.mp3`, "audio/mpeg", cc, rh))
    ?? (await serveAudio(c.env.ARCHIVE_PHOTOS, `audio/news/${idxno}-gem2.wav`, "audio/wav", cc, rh));
  return r ?? c.json({ error: "no_audio", hint: "Gemini 낭독 미생성(Chirp3-HD 폴백 비활성)" }, 503);
});
