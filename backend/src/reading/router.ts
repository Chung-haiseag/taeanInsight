// 독자 행동 기반 초개인화 (Phase 1) — 체류·스크롤 로그 수집 + 관심사 피드.
// 추가형: 기존 기능 변경 없음. 익명 uid(X-Taean-Uid)로 집계, 룰/점수 기반(무벡터·무LLM).

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";

export const readingRouter = new Hono<{ Bindings: Env }>();

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
  const empty = { hasData: false, readerType: "balanced" as const, topCategories: [] as string[], recentIdxnos: [] as number[] };
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

    return c.json({ hasData: topCategories.length > 0, readerType, topCategories, recentIdxnos });
  } catch {
    return c.json(empty);
  }
});
