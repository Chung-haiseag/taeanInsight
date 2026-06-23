// 시민기자 기사 CRUD/목록 (D1 영속) — 소유자는 익명 uid. 제출 시 거버넌스+HITL 검수 큐.
//   GET    /api/citizen/articles            내 기사 목록
//   POST   /api/citizen/articles            생성(초안)
//   GET    /api/citizen/articles/:id        상세(소유자)
//   PUT    /api/citizen/articles/:id        수정(draft/rejected만)
//   DELETE /api/citizen/articles/:id        삭제
//   POST   /api/citizen/articles/:id/submit 제출 → 거버넌스 적용 → 검수 큐

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import { identifyUser, type AuthVariables } from "../auth/middleware";
import { applyGovernance } from "../governance/middleware";
import { AI_LABEL_TEXT, type AiLabel } from "../governance/ai_label";
import { reviewService, nextReviewId, type ReviewItem } from "../governance/review_queue";

export const citizenArticlesRouter = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
citizenArticlesRouter.use("*", identifyUser((env) => (env as Env & { JWT_SECRET?: string }).JWT_SECRET ?? "dev-secret"));

const firstImage = (body: string): string | null => body.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1] ?? null;

interface Row {
  id: string; reporter_uid: string; title: string; body: string; ai_label: string;
  sources: string; cover_image_url: string | null; status: string; review_id: string | null;
  review_notes: string | null; created_at: string; updated_at: string; submitted_at: string | null;
}
const toArticle = (r: Row) => ({
  id: r.id, title: r.title, body: r.body, aiLabel: r.ai_label as AiLabel,
  sources: JSON.parse(r.sources || "[]") as { title: string; url?: string }[],
  coverImageUrl: r.cover_image_url, status: r.status, reviewId: r.review_id,
  reviewNotes: r.review_notes, createdAt: r.created_at, updatedAt: r.updated_at, submittedAt: r.submitted_at,
});

const writeSchema = z.object({
  title: z.string().max(100).optional(),
  body: z.string().max(50000).optional(),
  aiLabel: z.enum(["human", "ai_assisted", "ai_generated"]).optional(),
  sources: z.array(z.object({ title: z.string(), url: z.string().optional() })).optional(),
});

function db(c: { env: Env }): D1Database | null { return c.env.ARCHIVE_DB ?? null; }

// 목록
citizenArticlesRouter.get("/", async (c) => {
  const d = db(c); if (!d) return c.json({ items: [] });
  const r = await d.prepare("SELECT * FROM citizen_articles WHERE reporter_uid=?1 ORDER BY updated_at DESC LIMIT 100").bind(c.get("auth").sub).all<Row>();
  return c.json({ items: (r.results ?? []).map(toArticle) });
});

// 생성(초안)
citizenArticlesRouter.post("/", async (c) => {
  const d = db(c); if (!d) return c.json({ error: "no_db" }, 503);
  const p = writeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input" }, 400);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const body = p.data.body ?? "";
  await d.prepare(
    `INSERT INTO citizen_articles (id,reporter_uid,title,body,ai_label,sources,cover_image_url,status,created_at,updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,'draft',?8,?8)`,
  ).bind(id, c.get("auth").sub, p.data.title ?? "", body, p.data.aiLabel ?? "human", JSON.stringify(p.data.sources ?? []), firstImage(body), now).run();
  return c.json({ ok: true, id });
});

// 상세(소유자)
citizenArticlesRouter.get("/:id", async (c) => {
  const d = db(c); if (!d) return c.json({ error: "no_db" }, 503);
  const r = await d.prepare("SELECT * FROM citizen_articles WHERE id=?1 AND reporter_uid=?2").bind(c.req.param("id"), c.get("auth").sub).first<Row>();
  if (!r) return c.json({ error: "not_found" }, 404);
  return c.json({ article: toArticle(r) });
});

// 수정 (draft/rejected만)
citizenArticlesRouter.put("/:id", async (c) => {
  const d = db(c); if (!d) return c.json({ error: "no_db" }, 503);
  const p = writeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!p.success) return c.json({ error: "invalid_input" }, 400);
  const cur = await d.prepare("SELECT * FROM citizen_articles WHERE id=?1 AND reporter_uid=?2").bind(c.req.param("id"), c.get("auth").sub).first<Row>();
  if (!cur) return c.json({ error: "not_found" }, 404);
  if (cur.status !== "draft" && cur.status !== "rejected") return c.json({ error: "not_editable", status: cur.status }, 409);
  const title = p.data.title ?? cur.title;
  const body = p.data.body ?? cur.body;
  await d.prepare(
    `UPDATE citizen_articles SET title=?1, body=?2, ai_label=?3, sources=?4, cover_image_url=?5, updated_at=?6 WHERE id=?7`,
  ).bind(title, body, p.data.aiLabel ?? cur.ai_label, JSON.stringify(p.data.sources ?? JSON.parse(cur.sources || "[]")), firstImage(body), new Date().toISOString(), cur.id).run();
  return c.json({ ok: true });
});

// 삭제
citizenArticlesRouter.delete("/:id", async (c) => {
  const d = db(c); if (!d) return c.json({ error: "no_db" }, 503);
  const r = await d.prepare("DELETE FROM citizen_articles WHERE id=?1 AND reporter_uid=?2").bind(c.req.param("id"), c.get("auth").sub).run();
  return c.json({ ok: !!r.meta.changes });
});

// 제출 → 거버넌스 + 검수 큐
citizenArticlesRouter.post("/:id/submit", async (c) => {
  const d = db(c); if (!d) return c.json({ error: "no_db" }, 503);
  const cur = await d.prepare("SELECT * FROM citizen_articles WHERE id=?1 AND reporter_uid=?2").bind(c.req.param("id"), c.get("auth").sub).first<Row>();
  if (!cur) return c.json({ error: "not_found" }, 404);
  if (!cur.title.trim() || !cur.body.trim()) return c.json({ error: "empty" }, 400);

  const sources = JSON.parse(cur.sources || "[]") as { title: string; url?: string }[];
  const gov = applyGovernance({ body: cur.body, aiLabel: cur.ai_label as AiLabel, sources });
  const item: ReviewItem = {
    id: nextReviewId(),
    resourceType: "article",
    resourceId: `citizen:${cur.id}`,
    title: cur.title,
    excerpt: gov.body.length > 160 ? gov.body.slice(0, 160) + "…" : gov.body,
    aiLabel: gov.forcedAiLabel,
    sensitiveTopics: gov.sensitive.topics.map((t) => t.topic),
    piiKinds: [...new Set(gov.pii.findings.map((f) => f.kind))],
    requiresHitl: gov.sensitive.requiresHitl,
    blockAiOnly: gov.sensitive.blockAiOnly,
    reasons: gov.reasons,
    status: "pending",
    queuedAt: new Date().toISOString(),
  };
  reviewService.enqueue(item);
  await d.prepare("UPDATE citizen_articles SET status='submitted', review_id=?1, ai_label=?2, submitted_at=?3, updated_at=?3 WHERE id=?4")
    .bind(item.id, gov.forcedAiLabel, new Date().toISOString(), cur.id).run();

  return c.json({
    ok: true, queued: true, reviewId: item.id,
    aiLabel: gov.forcedAiLabel, aiLabelText: AI_LABEL_TEXT[gov.forcedAiLabel],
    publishAllowed: gov.publishGuard.allowed, reasons: gov.reasons,
    message: gov.publishGuard.allowed ? "검수 큐에 등록되었습니다. 편집부 승인 후 발행됩니다." : `발행 보류: ${gov.publishGuard.reason ?? "요건 미충족"} (검수 큐 등록됨)`,
  });
});
