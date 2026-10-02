// 아카이브 관리자 작업 — /api/admin/archive (adminGuard는 index.ts의 /api/admin/* 미들웨어가 건다).
import { Hono } from "hono";
import type { Env } from "../types";
import { refetchMissingImages, REFETCH_KEY } from "./refetch_images";
import { sweepMissingArticles, SWEEP_KEY } from "../news/sweep";

export const archiveAdminRouter = new Hono<{ Bindings: Env }>();

// 사진 보강 진행 상태 — kv_cache(images_refetch) 그대로.
archiveAdminRouter.get("/refetch-images", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const row = await db.prepare("SELECT v, ts FROM kv_cache WHERE k=?").bind(REFETCH_KEY).first<{ v: string; ts: number }>();
  return c.json({ cursor: row ? JSON.parse(row.v) : null, updatedAt: row ? new Date(row.ts).toISOString() : null });
});

// 사진 보강 한 배치 수동 실행. body: { batch?: number(≤200), before?: number(커서 강제) }
// 크론(3시간)이 알아서 돌지만, 특정 기사부터 다시 하고 싶을 때 before로 커서를 올린다.
archiveAdminRouter.post("/refetch-images", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const body = (await c.req.json().catch(() => ({}))) as { batch?: number; before?: number };
  const r = await refetchMissingImages(c.env, {
    batch: typeof body.batch === "number" ? body.batch : 60,
    before: typeof body.before === "number" ? body.before : undefined,
  });
  return c.json(r);
});

// 번호 순차 수집 상태 — kv_cache(article_sweep): 백필 커서·누계.
archiveAdminRouter.get("/sweep", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const row = await db.prepare("SELECT v, ts FROM kv_cache WHERE k=?").bind(SWEEP_KEY).first<{ v: string; ts: number }>();
  const fr = await db.prepare("SELECT MAX(idxno) m, COUNT(*) n FROM archive_articles WHERE idxno<90000000").first<{ m: number; n: number }>();
  return c.json({ cursor: row ? JSON.parse(row.v) : null, updatedAt: row ? new Date(row.ts).toISOString() : null, frontier: fr?.m ?? null, articles: fr?.n ?? null });
});

// 번호 순차 수집 한 번 실행. body: { back?: number(백필 커서 강제), backBudget?: number, maxInsert?: number }
// 크론(3시간)이 알아서 돌지만, 빠진 구간을 다시 훑고 싶을 때 back으로 커서를 올린다.
archiveAdminRouter.post("/sweep", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const body = (await c.req.json().catch(() => ({}))) as { back?: number; backBudget?: number; maxInsert?: number };
  const r = await sweepMissingArticles(c.env, {
    back: typeof body.back === "number" ? body.back : undefined,
    backBudget: typeof body.backBudget === "number" ? Math.min(200, body.backBudget) : undefined,
    maxInsert: typeof body.maxInsert === "number" ? Math.min(150, body.maxInsert) : undefined,
  });
  return c.json(r);
});
