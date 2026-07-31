// 관리자 보고서 — 데이터 규모·신선도 요약(읽기 전용). /api/admin/report 하위(adminGuard 상속).
//   각 집계는 방어적(실패 시 null) — 테이블 부재·오류가 전체를 죽이지 않게.
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
  const [articles, ebook, kgNodes, kgEdges, users, regionalNews, facts, pendingApplications, pushSubs] = await Promise.all([
    scalar(db, "SELECT COUNT(*) n FROM archive_articles"),
    scalar(db, "SELECT COUNT(*) n FROM archive_articles WHERE idxno BETWEEN 90000001 AND 90099999"),
    scalar(db, "SELECT COUNT(*) n FROM kg_nodes"),
    scalar(db, "SELECT COUNT(*) n FROM kg_edges"),
    scalar(db, "SELECT COUNT(*) n FROM users"),
    scalar(db, "SELECT COUNT(*) n FROM regional_news"),
    scalar(db, "SELECT COUNT(*) n FROM facts"),
    scalar(db, "SELECT COUNT(*) n FROM citizen_applications WHERE status='pending'"),
    scalar(db, "SELECT COUNT(*) n FROM push_subscriptions"),
  ]);
  const [latestArticle, latestRegional] = await Promise.all([
    text1(db, "SELECT MAX(published_at) v FROM archive_articles"),
    text1(db, "SELECT MAX(published_at) v FROM regional_news"),
  ]);
  return c.json({
    counts: { articles, ebook, kgNodes, kgEdges, users, regionalNews, facts, pendingApplications, pushSubs },
    freshness: { latestArticle, latestRegional },
    generatedAt: new Date().toISOString(),
  });
});
