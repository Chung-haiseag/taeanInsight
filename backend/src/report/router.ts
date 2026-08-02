// 관리자 보고서 — 데이터 규모·신선도·외부연동 요약(읽기 전용). /api/admin/report 하위(adminGuard 상속).
//   각 집계는 방어적(실패 시 null). config는 시크릿 '설정 여부'(불리언)만 — 값은 절대 노출하지 않는다.
import { Hono } from "hono";
import type { Env } from "../types";

export const reportRouter = new Hono<{ Bindings: Env }>();

async function scalar(db: D1Database, sql: string): Promise<number | null> {
  try { const r = await db.prepare(sql).first<{ n: number }>(); return r?.n ?? 0; } catch { return null; }
}
async function text1(db: D1Database, sql: string): Promise<string | null> {
  try { const r = await db.prepare(sql).first<{ v: string | null }>(); return r?.v ?? null; } catch { return null; }
}
async function rows<T = Record<string, unknown>>(db: D1Database, sql: string): Promise<T[]> {
  try { const r = await db.prepare(sql).all<T>(); return r.results ?? []; } catch { return []; }
}

// 멤버십 사전신청 전환 퍼널 — 방문(usage_events membership_view)→CTA→신청(subscription_leads)→전환율.
//   첫달무료→유료 전환/유지는 결제(PG) 연동 후 채워짐(현재 PoC라 데이터 없음).
reportRouter.get("/membership-funnel", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const [views, ctaClicks, leads] = await Promise.all([
    scalar(db, "SELECT COUNT(*) n FROM usage_events WHERE type='membership_view'"),
    scalar(db, "SELECT COUNT(*) n FROM usage_events WHERE type='membership_cta'"),
    scalar(db, "SELECT COUNT(*) n FROM subscription_leads"),
  ]);
  const [leadsByPlan, ctaByPlan, viewsBySource, viewsDaily, leadsDaily] = await Promise.all([
    rows(db, "SELECT plan, COUNT(*) n FROM subscription_leads GROUP BY plan"),
    rows(db, "SELECT ref plan, COUNT(*) n FROM usage_events WHERE type='membership_cta' AND ref IS NOT NULL GROUP BY ref"),
    rows(db, "SELECT COALESCE(NULLIF(ref,''),'direct') src, COUNT(*) n FROM usage_events WHERE type='membership_view' GROUP BY src ORDER BY n DESC LIMIT 8"),
    rows(db, "SELECT substr(created_at,1,10) day, COUNT(*) n FROM usage_events WHERE type='membership_view' AND created_at >= date('now','-14 day') GROUP BY day ORDER BY day"),
    rows(db, "SELECT substr(created_at,1,10) day, COUNT(*) n FROM subscription_leads WHERE created_at >= date('now','-14 day') GROUP BY day ORDER BY day"),
  ]);
  const conversion = views && views > 0 ? (leads ?? 0) / views : null;
  return c.json({
    views: views ?? 0, ctaClicks: ctaClicks ?? 0, leads: leads ?? 0, conversion,
    leadsByPlan, ctaByPlan, viewsBySource, viewsDaily, leadsDaily,
    paid: null, // 첫달무료→유료 전환/유지: 결제 연동 후
  });
});

reportRouter.get("/summary", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);

  const [
    articles, ebook, kgNodes, kgEdges, users, regionalNews, facts,
    pendingApplications, pushSubs, citizenArticles, govNotices, weeklyReports, envDays, reporters,
  ] = await Promise.all([
    scalar(db, "SELECT COUNT(*) n FROM archive_articles"),
    scalar(db, "SELECT COUNT(*) n FROM archive_articles WHERE idxno BETWEEN 90000001 AND 90099999"),
    scalar(db, "SELECT COUNT(*) n FROM kg_nodes"),
    scalar(db, "SELECT COUNT(*) n FROM kg_edges"),
    scalar(db, "SELECT COUNT(*) n FROM users"),
    scalar(db, "SELECT COUNT(*) n FROM regional_news"),
    scalar(db, "SELECT COUNT(*) n FROM facts"),
    scalar(db, "SELECT COUNT(*) n FROM citizen_applications WHERE status='pending'"),
    scalar(db, "SELECT COUNT(*) n FROM push_subscriptions"),
    scalar(db, "SELECT COUNT(*) n FROM citizen_articles"),
    scalar(db, "SELECT COUNT(*) n FROM gov_notices"),
    scalar(db, "SELECT COUNT(*) n FROM weekly_reports"),
    scalar(db, "SELECT COUNT(*) n FROM env_daily"),
    scalar(db, "SELECT COUNT(*) n FROM reporters"),
  ]);

  const [latestArticle, latestRegional, latestEnv] = await Promise.all([
    text1(db, "SELECT MAX(published_at) v FROM archive_articles"),
    text1(db, "SELECT MAX(published_at) v FROM regional_news"),
    text1(db, "SELECT MAX(date) v FROM env_daily"),
  ]);

  // 외부 연동 설정 여부(값 아님). env를 레코드로 보고 존재만 확인.
  const e = c.env as unknown as Record<string, unknown>;
  const has = (k: string) => !!e[k];
  const config = {
    taeanLogin: has("TAEAN_ID") && has("TAEAN_PW"),
    dataGoKr: has("DATA_GO_KR_KEY"),
    naver: has("NAVER_CLIENT_ID") && has("NAVER_CLIENT_SECRET"),
    kakao: has("KAKAO_REST_KEY"),
    webSearch: has("WEB_SEARCH_API_KEY"),
    opinet: has("OPINET_KEY"),
    push: has("VAPID_PRIVATE_KEY"),
    adminToken: has("ADMIN_TOKEN"),
    slack: has("SLACK_WEBHOOK_URL"),
  };

  return c.json({
    counts: {
      articles, ebook, kgNodes, kgEdges, users, regionalNews, facts,
      pendingApplications, pushSubs, citizenArticles, govNotices, weeklyReports, envDays, reporters,
    },
    freshness: { latestArticle, latestRegional, latestEnv },
    config,
    generatedAt: new Date().toISOString(),
  });
});
