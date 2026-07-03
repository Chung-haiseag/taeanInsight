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

// GET /api/admin/analytics/jobs — 자동작업 현황(수집·생성 파이프라인 전체).
// 각 작업의 최근 실행(데이터 타임스탬프 기준)·최근 결과·신선도(주기×2 초과 시 warn).
analyticsRouter.get("/jobs", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const one = async <T = Record<string, unknown>>(sql: string): Promise<T> =>
    ((await db.prepare(sql).first<T>()) ?? ({} as T));

  const now = Date.now();
  const hoursAgo = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    return Number.isFinite(t) ? (now - t) / 3600_000 : null;
  };
  type Job = { key: string; name: string; source: string; schedule: string; lastRun: string | null; result: string; status: "ok" | "warn" | "idle" };
  const mk = (key: string, name: string, source: string, schedule: string, lastIso: string | null | undefined, result: string, expectHours: number): Job => {
    const h = hoursAgo(lastIso);
    return { key, name, source, schedule, lastRun: lastIso ?? null, result, status: h === null ? "idle" : h <= expectHours * 2 ? "ok" : "warn" };
  };

  // 1) 태안뉴스 수집
  const newsCache = await one<{ u: string }>("SELECT MAX(updated_at) u FROM news_cache");
  const newsNew = await one<{ n: number; latest: string }>("SELECT COUNT(*) n, MAX(published_at) latest FROM archive_articles WHERE published_at >= date('now','-7 day')");
  // 2) 군청 소식
  const gov = await one<{ u: string; n24: number; total: number }>("SELECT MAX(fetched_at) u, SUM(CASE WHEN fetched_at >= datetime('now','-1 day') THEN 1 ELSE 0 END) n24, COUNT(*) total FROM gov_notices");
  // 3) CCTV
  const cctv = await one<{ u: string; n: number }>("SELECT MAX(updated_at) u, COUNT(*) n FROM cctv_cameras");
  // 4) 언론 클리핑
  const clips = await one<{ u: string; n24: number; total: number }>("SELECT MAX(created_at) u, SUM(CASE WHEN created_at >= datetime('now','-1 day') THEN 1 ELSE 0 END) n24, COUNT(*) total FROM news_clips");
  // 5) 공공데이터 스냅샷(data.go.kr — 날씨·해양·대기·실거래·관광)
  const snap = await one<{ u: string }>("SELECT MAX(updated_at) u FROM metrics_snapshot");
  const envd = await one<{ u: string; d: string }>("SELECT MAX(captured_at) u, MAX(date) d FROM env_daily");
  // 6) 주간 리포트
  const rep = await one<{ w: string; p: string }>("SELECT week_id w, published_at p FROM weekly_reports WHERE status='published' ORDER BY week_id DESC LIMIT 1");
  // 9) 취재 알림
  const alerts = await one<{ u: string; n24: number }>("SELECT MAX(created_at) u, SUM(CASE WHEN created_at >= datetime('now','-1 day') THEN 1 ELSE 0 END) n24 FROM reporter_alerts");

  // 7·8) 오디오(VPS Gemini 잡) — R2 status.json + 이번주 팟캐스트 파일 존재
  let audioStatus: { podcast?: { week?: string; at?: string }; news?: { generated?: number; skipped?: number; failed?: number; target?: number; at?: string } } = {};
  let podcastLive = false;
  if (c.env.ARCHIVE_PHOTOS) {
    try { const s = await c.env.ARCHIVE_PHOTOS.get("audio/status.json"); if (s) audioStatus = await s.json(); } catch { /* */ }
    if (rep.w) podcastLive = !!(await c.env.ARCHIVE_PHOTOS.head(`audio/podcast/${rep.w}-gem.wav`));
  }
  const na = audioStatus.news;

  const jobs: Job[] = [
    mk("news", "태안뉴스 수집", "taeannews.co.kr (Worker)", "12시간", newsCache.u, `최근 7일 신규 ${newsNew.n ?? 0}건 · 최신 기사 ${String(newsNew.latest ?? "-").slice(0, 10)}`, 12),
    mk("gov", "군청 소식 수집", "태안군청 (VPS 한국IP)", "6시간", gov.u, `24h 신규 ${gov.n24 ?? 0}건 · 누적 ${gov.total ?? 0}건`, 6),
    mk("cctv", "도로 CCTV 갱신", "ITS 국가교통정보 (VPS)", "30분", cctv.u, `카메라 ${cctv.n ?? 0}대`, 0.5),
    mk("clips", "언론 클리핑", "네이버 뉴스검색 (Worker)", "12시간", clips.u, `24h 신규 ${clips.n24 ?? 0}건 · 누적 ${clips.total ?? 0}건`, 12),
    mk("snapshot", "공공데이터 스냅샷", "data.go.kr 10여 종 (Worker)", "30분", snap.u, "날씨·해양·대기·실거래·관광 지표", 0.5),
    mk("envdaily", "환경 일일 기록", "data.go.kr (Worker)", "매일", envd.u, `최근 기록일 ${envd.d ?? "-"}`, 24),
    mk("report", "주간 리포트 자동발행", "Workers AI (금 16시)", "주 1회", rep.p, rep.w ? `${rep.w} 발행됨` : "발행 이력 없음", 24 * 7),
    mk("podcast", "주간 AI 팟캐스트", "Gemini 멀티스피커 (VPS 금 18시)", "주 1회", audioStatus.podcast?.at, podcastLive ? `${rep.w} Gemini 라이브 ✓` : "이번 주 미생성(Chirp3-HD 폴백)", 24 * 7),
    mk("newsaudio", "기사 낭독 생성", "Gemini (VPS 매일 07시)", "매일", na?.at, na ? `생성 ${na.generated ?? 0} · 스킵 ${na.skipped ?? 0} · 실패 ${na.failed ?? 0} / 대상 ${na.target ?? 0}` : "실행 기록 없음", 24),
    mk("alerts", "기자 취재 알림", "군청·특보·급변·키워드 (Worker)", "상시", alerts.u, `24h ${alerts.n24 ?? 0}건`, 24),
  ];

  return c.json({ jobs, generatedAt: new Date().toISOString() });
});
