// 운영·분석 대시보드 데이터 — 관리자 전용(/api/admin/analytics, adminGuard 보호).
// 실수집 데이터만: reading_events(조회·체류·스크롤), user_preferences(온보딩), push_subscriptions.

import { Hono } from "hono";
import type { Env } from "../types";

export const analyticsRouter = new Hono<{ Bindings: Env }>();

analyticsRouter.get("/", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const one = async <T = Record<string, unknown>>(sql: string): Promise<T> =>
    ((await db.prepare(sql).first<T>()) ?? ({} as T));
  const many = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
    ((await db.prepare(sql).all<T>()).results ?? []);

  // 읽기 활동 요약
  const reads = await one<{ total: number; readers: number; avg_dwell: number; avg_scroll: number }>(
    "SELECT COUNT(*) total, COUNT(DISTINCT uid) readers, COALESCE(AVG(dwell_ms),0) avg_dwell, COALESCE(AVG(scroll_pct),0) avg_scroll FROM reading_events",
  );
  // 인기 기사 Top 10(조회수)
  const topArticles = await many<{ idxno: number; title: string; reads: number; avg_dwell: number }>(
    `SELECT e.idxno, a.title, COUNT(*) reads, COALESCE(AVG(e.dwell_ms),0) avg_dwell
       FROM reading_events e LEFT JOIN archive_articles a ON a.idxno = e.idxno
      GROUP BY e.idxno ORDER BY reads DESC LIMIT 10`,
  );
  // 카테고리별 조회
  const byCategory = await many<{ category: string; reads: number }>(
    "SELECT COALESCE(category,'기타') category, COUNT(*) reads FROM reading_events GROUP BY category ORDER BY reads DESC",
  );
  // 일별 조회(최근 14일)
  const daily = await many<{ day: string; reads: number }>(
    "SELECT substr(created_at,1,10) day, COUNT(*) reads FROM reading_events WHERE created_at >= date('now','-14 day') GROUP BY day ORDER BY day",
  );
  // 독자 규모
  const audience = await one<{ onboarded: number; pushSubs: number }>(
    "SELECT (SELECT COUNT(*) FROM user_preferences) onboarded, (SELECT COUNT(*) FROM push_subscriptions) pushSubs",
  );
  // 세그먼트 분포
  const segments = await many<{ segment: string; n: number }>(
    "SELECT COALESCE(segment,'미지정') segment, COUNT(*) n FROM user_preferences GROUP BY segment ORDER BY n DESC",
  );
  // 사용 이벤트(오디오 재생·AI 질의 등)
  const usageByType = await many<{ type: string; n: number }>(
    "SELECT type, COUNT(*) n FROM usage_events GROUP BY type ORDER BY n DESC",
  ).catch(() => []);
  const audioByRef = await many<{ ref: string; n: number }>(
    "SELECT COALESCE(ref,'기타') ref, COUNT(*) n FROM usage_events WHERE type='audio_play' GROUP BY ref ORDER BY n DESC LIMIT 8",
  ).catch(() => []);
  const topQueries = await many<{ ref: string; n: number }>(
    "SELECT ref, COUNT(*) n FROM usage_events WHERE type='ai_query' AND ref IS NOT NULL GROUP BY ref ORDER BY n DESC LIMIT 10",
  ).catch(() => []);

  return c.json({
    usage: {
      byType: usageByType,
      audioPlays: usageByType.find((x) => x.type === "audio_play")?.n ?? 0,
      aiQueries: usageByType.find((x) => x.type === "ai_query")?.n ?? 0,
      audioByRef,
      topQueries,
    },
    reads: {
      total: reads.total ?? 0,
      readers: reads.readers ?? 0,
      avgDwellSec: Math.round((reads.avg_dwell ?? 0) / 1000),
      avgScrollPct: Math.round(reads.avg_scroll ?? 0),
    },
    topArticles: topArticles.map((r) => ({ idxno: r.idxno, title: r.title ?? `기사 ${r.idxno}`, reads: r.reads, avgDwellSec: Math.round((r.avg_dwell ?? 0) / 1000) })),
    byCategory,
    daily,
    audience: { onboarded: audience.onboarded ?? 0, pushSubs: audience.pushSubs ?? 0 },
    segments,
    generatedAt: new Date().toISOString(),
  });
});
