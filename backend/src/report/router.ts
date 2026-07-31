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
