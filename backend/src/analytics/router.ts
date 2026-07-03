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

// GET /api/admin/analytics/roi — 경영 성과(투자 대비 가시 효과). 실데이터 + 투명한 환산식.
analyticsRouter.get("/roi", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const row = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM archive_articles) total_articles,
    (SELECT COUNT(*) FROM archive_articles WHERE idxno >= 90000001) digitized,
    (SELECT MIN(year) FROM archive_articles) year_from,
    (SELECT MAX(year) FROM archive_articles) year_to,
    (SELECT COUNT(*) FROM weekly_reports WHERE status='published') reports_published,
    (SELECT COUNT(*) FROM news_clips) clips,
    (SELECT COUNT(*) FROM gov_notices) gov_notices,
    (SELECT COUNT(*) FROM reporter_alerts) reporter_alerts,
    (SELECT COUNT(*) FROM user_preferences) onboarded,
    (SELECT COUNT(*) FROM push_subscriptions) push_subs,
    (SELECT COUNT(*) FROM users) accounts,
    (SELECT COUNT(*) FROM reading_events) reads,
    (SELECT COUNT(*) FROM usage_events WHERE type='audio_play') audio_plays,
    (SELECT COUNT(*) FROM usage_events WHERE type='ai_query') ai_queries
  `).first<Record<string, number>>() ?? {};

  // 멤버십 사전 신청(수요 검증)
  const leads = (await db.prepare("SELECT plan, COUNT(*) n FROM subscription_leads GROUP BY plan").all<{ plan: string; n: number }>()).results ?? [];
  const recentLeads = (await db.prepare("SELECT email, plan, name, note, created_at FROM subscription_leads ORDER BY id DESC LIMIT 20").all()).results ?? [];

  // 환산(보수적 가정 — 식을 함께 반환해 검증 가능하게)
  const WAGE = 20000; // 기자 인건비 추정 시급(원)
  const digitizedValue = (row.digitized ?? 0) * 2000;                    // 외주 OCR+교정 최저단가 2,000원/건
  const reportValue = (row.reports_published ?? 0) * 4 * WAGE;           // 리포트 1회 = 리서치·작성 4h
  const clipValue = Math.round((row.clips ?? 0) * 3 / 60 * WAGE);        // 클리핑 1건 = 검색·정리 3분
  const alertValue = Math.round((row.reporter_alerts ?? 0) * 10 / 60 * WAGE); // 알림 1건 = 모니터링 10분
  const govValue = Math.round((row.gov_notices ?? 0) * 5 / 60 * WAGE);   // 군청소식 1건 = 확인·정리 5분

  return c.json({
    assets: {
      totalArticles: row.total_articles ?? 0,
      digitized: row.digitized ?? 0,
      yearRange: `${row.year_from ?? "-"}~${row.year_to ?? "-"}`,
    },
    automation: [
      { item: "지면 디지털화(1990~2001)", actual: `${(row.digitized ?? 0).toLocaleString()}건`, valueKrw: digitizedValue, formula: "건당 외주 최저단가 2,000원" },
      { item: "주간 리포트 자동 생성·발행", actual: `${row.reports_published ?? 0}회`, valueKrw: reportValue, formula: "회당 리서치·작성 4시간 × 시급 2만원" },
      { item: "언론 클리핑 자동 수집", actual: `${row.clips ?? 0}건`, valueKrw: clipValue, formula: "건당 검색·정리 3분 × 시급 2만원" },
      { item: "군청 소식 자동 수집", actual: `${row.gov_notices ?? 0}건`, valueKrw: govValue, formula: "건당 확인·정리 5분 × 시급 2만원" },
      { item: "기자 취재 알림", actual: `${row.reporter_alerts ?? 0}건`, valueKrw: alertValue, formula: "건당 모니터링 10분 × 시급 2만원" },
    ],
    totalValueKrw: digitizedValue + reportValue + clipValue + alertValue + govValue,
    audience: {
      onboarded: row.onboarded ?? 0, pushSubs: row.push_subs ?? 0, accounts: row.accounts ?? 0,
      reads: row.reads ?? 0, audioPlays: row.audio_plays ?? 0, aiQueries: row.ai_queries ?? 0,
    },
    demand: { leads, recentLeads },
    generatedAt: new Date().toISOString(),
  });
});
