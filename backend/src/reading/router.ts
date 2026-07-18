// 독자 행동 기반 초개인화 (Phase 1) — 체류·스크롤 로그 수집 + 관심사 피드.
// 추가형: 기존 기능 변경 없음. 익명 uid(X-Taean-Uid)로 집계, 룰/점수 기반(무벡터·무LLM).

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { embedText } from "../lib/embed";

export const readingRouter = new Hono<{ Bindings: Env }>();

// ── Phase 2: 기사 임베딩(bge-m3 1024d) + Vectorize 맥락 추천 ──
interface RecItem { idxno: number; title: string; category: string; publishedAt: string; excerpt: string }

// 최근 기사 N건 임베딩 → Vectorize 적재(id=idxno, 메타데이터에 표시정보). 재실행 안전(upsert).
export async function embedRecentArticles(env: Env, limit = 400, sinceDays = 120): Promise<{ embedded: number }> {
  if (!env.ARCHIVE_DB || !env.VECTORIZE || !env.AI) return { embedded: 0 };
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10);
  const r = await env.ARCHIVE_DB
    .prepare("SELECT idxno, title, category, published_at, substr(COALESCE(body, excerpt, ''),1,1200) AS snippet FROM archive_articles WHERE published_at >= ? AND (category IS NOT NULL) ORDER BY published_at DESC LIMIT ?")
    .bind(since, limit)
    .all<{ idxno: number; title: string; category: string; published_at: string; snippet: string }>();
  const rows = r.results ?? [];
  let embedded = 0;
  for (const a of rows) {
    const vec = await embedText(env, `${a.title}\n${a.snippet}`);
    if (!vec) continue;
    try {
      await env.VECTORIZE.upsert([{
        id: String(a.idxno),
        values: vec,
        metadata: { idxno: a.idxno, category: a.category ?? "", title: a.title.slice(0, 180), publishedAt: a.published_at ?? "", excerpt: (a.snippet ?? "").slice(0, 200) },
      }]);
      embedded += 1;
    } catch { /* 개별 실패 무시 */ }
  }
  return { embedded };
}

// 아카이브 임베딩 백필 — after(idxno) 이후 본문충실·광고제외 기사를 idxno 오름차순으로 배치 임베딩.
// 재실행 안전(upsert). 로컬 루프가 done까지 반복 호출.
export async function embedBackfillBatch(env: Env, after: number, limit: number): Promise<{ embedded: number; lastIdxno: number | null; done: boolean }> {
  if (!env.ARCHIVE_DB || !env.VECTORIZE || !env.AI) return { embedded: 0, lastIdxno: null, done: true };
  const r = await env.ARCHIVE_DB
    .prepare(
      "SELECT idxno, title, category, published_at, substr(COALESCE(body, excerpt, ''),1,1200) AS snippet " +
        "FROM archive_articles WHERE idxno > ? AND length(COALESCE(body,''))>500 AND title NOT LIKE '%광고%' " +
        "ORDER BY idxno ASC LIMIT ?",
    )
    .bind(after, limit)
    .all<{ idxno: number; title: string; category: string; published_at: string; snippet: string }>();
  const rows = r.results ?? [];
  let embedded = 0, lastIdxno: number | null = after || null;
  for (const a of rows) {
    lastIdxno = a.idxno;
    const vec = await embedText(env, `${a.title}\n${a.snippet}`);
    if (!vec) continue;
    try {
      await env.VECTORIZE.upsert([{
        id: String(a.idxno),
        values: vec,
        metadata: { idxno: a.idxno, category: a.category ?? "", title: a.title.slice(0, 180), publishedAt: a.published_at ?? "", excerpt: (a.snippet ?? "").slice(0, 200) },
      }]);
      embedded += 1;
    } catch { /* 개별 실패 무시 */ }
  }
  return { embedded, lastIdxno, done: rows.length < limit };
}

// 독자가 읽은 기사 벡터 평균 → 최근접 추천(읽은 것 제외)
async function vectorRecommend(env: Env, readIdxnos: number[]): Promise<RecItem[]> {
  if (!env.VECTORIZE || !readIdxnos.length) return [];
  try {
    const ids = readIdxnos.slice(0, 20).map(String);
    const got = await env.VECTORIZE.getByIds(ids);
    const vecs = (got ?? []).map((v) => v.values as number[]).filter((v) => Array.isArray(v) && v.length);
    if (!vecs.length) return [];
    const dim = vecs[0].length;
    const avg = new Array(dim).fill(0);
    for (const v of vecs) for (let i = 0; i < dim; i++) avg[i] += v[i];
    for (let i = 0; i < dim; i++) avg[i] /= vecs.length;
    const q = await env.VECTORIZE.query(avg, { topK: 12, returnMetadata: true });
    const read = new Set(readIdxnos);
    const out: RecItem[] = [];
    for (const m of q.matches ?? []) {
      const md = (m.metadata ?? {}) as Record<string, unknown>;
      const idxno = Number(md.idxno ?? m.id);
      if (!idxno || read.has(idxno)) continue;
      out.push({ idxno, title: String(md.title ?? ""), category: String(md.category ?? ""), publishedAt: String(md.publishedAt ?? ""), excerpt: String(md.excerpt ?? "") });
      if (out.length >= 5) break;
    }
    return out;
  } catch { return []; }
}

function uidOf(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const u = c.req.header("X-Taean-Uid");
  return u && /^[A-Za-z0-9_-]{8,64}$/.test(u) ? u : null;
}

// 체류·스크롤 → 관심 점수(0~5): 3초 미만 이탈=0 … 끝까지 정독=5
function interestScore(dwellMs: number, scrollPct: number): number {
  if (dwellMs < 3000) return 0;
  const dwellPart = Math.min(3, dwellMs / 20000 * 3);   // ~20초에 3점
  const scrollPart = Math.min(2, scrollPct / 100 * 2);  // 100%에 2점
  return Math.round((dwellPart + scrollPart) * 10) / 10;
}

const eventSchema = z.object({
  idxno: z.number().int().positive(),
  category: z.string().max(40).optional(),
  dwellMs: z.number().int().min(0).max(3600_000),
  scrollPct: z.number().int().min(0).max(100),
});

// POST /api/reading/track — 범용 사용 이벤트(오디오 재생·AI 질의 등)
const trackSchema = z.object({ type: z.string().max(24), ref: z.string().max(200).optional() });
readingRouter.post("/track", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ ok: false });
  const uid = uidOf(c);
  if (!uid) return c.json({ ok: false });
  const parsed = trackSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ ok: false });
  try {
    await c.env.ARCHIVE_DB
      .prepare("INSERT INTO usage_events (uid, type, ref, created_at) VALUES (?,?,?,?)")
      .bind(uid, parsed.data.type, parsed.data.ref ?? null, new Date().toISOString())
      .run();
  } catch { /* 단일 실패 무시 */ }
  return c.json({ ok: true });
});

// POST /api/reading/event — 기사 1건 읽기 종료 시 비콘
readingRouter.post("/event", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ ok: false });
  const uid = uidOf(c);
  if (!uid) return c.json({ ok: false }); // 익명 식별 없으면 조용히 무시
  const parsed = eventSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ ok: false });
  const { idxno, category, dwellMs, scrollPct } = parsed.data;
  if (dwellMs < 1500) return c.json({ ok: true, skipped: "too_short" }); // 스침은 저장 안 함
  try {
    await c.env.ARCHIVE_DB
      .prepare("INSERT INTO reading_events (uid, idxno, category, dwell_ms, scroll_pct, created_at) VALUES (?,?,?,?,?,?)")
      .bind(uid, idxno, category ?? null, dwellMs, scrollPct, new Date().toISOString())
      .run();
  } catch { /* 단일 실패 무시 */ }
  return c.json({ ok: true });
});

// GET /api/reading/feed — 독자 행동 요약: 관심 카테고리 순위 + 독자 유형 + 최근 읽은 idxno
readingRouter.get("/feed", async (c) => {
  const empty = { hasData: false, readerType: "balanced" as const, topCategories: [] as string[], recentIdxnos: [] as number[], recommended: [] as RecItem[] };
  if (!c.env.ARCHIVE_DB) return c.json(empty);
  const uid = uidOf(c);
  if (!uid) return c.json(empty);
  try {
    const r = await c.env.ARCHIVE_DB
      .prepare("SELECT idxno, category, dwell_ms, scroll_pct FROM reading_events WHERE uid=? AND created_at > ? ORDER BY created_at DESC LIMIT 200")
      .bind(uid, new Date(Date.now() - 30 * 86400_000).toISOString())
      .all<{ idxno: number; category: string | null; dwell_ms: number; scroll_pct: number }>();
    const rows = r.results ?? [];
    if (!rows.length) return c.json(empty);

    const catScore = new Map<string, number>();
    let scrollSum = 0, scrollN = 0;
    const recentIdxnos: number[] = [];
    for (const e of rows) {
      if (recentIdxnos.length < 30 && e.idxno) recentIdxnos.push(e.idxno);
      if (e.category) catScore.set(e.category, (catScore.get(e.category) ?? 0) + interestScore(e.dwell_ms, e.scroll_pct));
      if (e.scroll_pct != null) { scrollSum += e.scroll_pct; scrollN += 1; }
    }
    const topCategories = [...catScore.entries()].sort((a, b) => b[1] - a[1]).filter(([, s]) => s > 0).slice(0, 3).map(([k]) => k);
    const avgScroll = scrollN ? scrollSum / scrollN : 0;
    const readerType = avgScroll >= 70 ? "heavy" : avgScroll < 40 ? "scanner" : "balanced";

    // Phase 2: 임베딩 맥락 추천(가능할 때). 실패/미적재면 빈 배열 → 프론트가 카테고리 룰로 폴백.
    const recommended = await vectorRecommend(c.env, recentIdxnos);

    return c.json({ hasData: topCategories.length > 0 || recommended.length > 0, readerType, topCategories, recentIdxnos, recommended });
  } catch {
    return c.json(empty);
  }
});

// GET /api/reading/summary?idxno= — 기사 AI 3줄 요약(스캐너용). D1 캐시(영구) + Workers AI.
readingRouter.get("/summary", async (c) => {
  const idxno = Number(c.req.query("idxno"));
  if (!idxno || !c.env.ARCHIVE_DB || !c.env.AI) return c.json({ summary: null });
  const { readCache, writeCache } = await import("../lib/api_cache");
  const key = `summary3:${idxno}`;
  const cached = await readCache<{ summary: string }>(c.env.ARCHIVE_DB, key);
  if (cached?.value?.summary) return c.json({ summary: cached.value.summary, cached: true });

  const row = await c.env.ARCHIVE_DB
    .prepare("SELECT title, substr(COALESCE(body, excerpt, ''),1,2000) AS body FROM archive_articles WHERE idxno=?")
    .bind(idxno)
    .first<{ title: string; body: string }>();
  if (!row || !row.body) return c.json({ summary: null });

  try {
    const { WorkersAiLlmClient } = await import("../llm/workers_ai");
    const client = new WorkersAiLlmClient({ ai: c.env.AI });
    const res = await client.complete({
      channel: "realtime", maxTokens: 220, temperature: 0.2,
      messages: [
        { role: "system", content: "다음 한국어 기사를 핵심만 3줄로 요약하라. 각 줄은 '- '로 시작하는 한 문장. 새로운 사실을 지어내지 말고 본문 내용만. 군더더기 없이." },
        { role: "user", content: `[제목] ${row.title}\n[본문] ${row.body}` },
      ],
    });
    const summary = (res.content ?? "").trim();
    if (summary) await writeCache(c.env.ARCHIVE_DB, key, { summary });
    return c.json({ summary });
  } catch {
    return c.json({ summary: null });
  }
});

// POST /api/reading/embed-recent — 최근 기사 임베딩 백필(관리자 토큰)
readingRouter.post("/embed-recent", async (c) => {
  const token = c.req.header("X-Admin-Token");
  const expected = (c.env as Env & { GOV_IMPORT_TOKEN?: string }).GOV_IMPORT_TOKEN;
  if (!expected || token !== expected) return c.json({ error: "unauthorized" }, 401);
  const limit = Math.min(800, Number(c.req.query("limit")) || 400);
  return c.json(await embedRecentArticles(c.env, limit));
});

// POST /api/reading/embed-backfill?after=&limit= — 아카이브 임베딩 백필(관리자 ADMIN_TOKEN)
readingRouter.post("/embed-backfill", async (c) => {
  const token = c.req.header("X-Admin-Token");
  const expected = (c.env as Env & { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  if (!expected || token !== expected) return c.json({ error: "unauthorized" }, 401);
  const after = Math.max(0, Number(c.req.query("after")) || 0);
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit")) || 100));
  return c.json(await embedBackfillBatch(c.env, after, limit));
});
