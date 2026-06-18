// 주간 인사이트 리포트 API — REQ-PRODUCT-001 / TaskMaster #22
//   공개:   GET  /api/reports            발행분 목록
//           GET  /api/reports/latest     최신 발행분(구독 게이팅)
//           GET  /api/reports/:weekId     특정 주차(구독 게이팅)
//   관리자: POST /api/admin/reports/generate         초안 생성(Workers AI)
//           POST /api/admin/reports/:weekId/publish  HITL 검토 후 발행 + 알림
//
// LLM: Workers AI 무료 모델(운영 Worker는 Claude API 미사용). 게이팅은 ?tier= 쿼리로 판별
//   (다른 라우터와 동일한 PoC 방식 — 운영 시 JWT auth.sub/플랜으로 대체).

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import { InMemoryMonthlyQuery, CircuitBreaker } from "../cost/circuit_breaker";
import { DefaultCostRecorder, InMemoryCostStore } from "../cost/recorder";
import { HybridLlmRouter } from "../llm/hybrid_router";
import { WorkersAiLlmClient } from "../llm/workers_ai";
import { WeeklyReportPipeline } from "./weekly_pipeline";
import { makeFactsLoader } from "./facts";
import { WeeklyReportRepo, type StoredReport } from "./repo";
import { notifyReportPublished } from "./notify";
import type { ReportSection } from "./types";

// 프리미엄(전체 열람) 등급 판별 — 비구독/익명은 미리보기
function isPremium(tier?: string | null): boolean {
  return !!tier && /(premium|b2b|b2g)/i.test(tier);
}

interface GatedSection extends ReportSection {
  locked: boolean;
  truncated?: boolean;
}

interface GatedReport {
  weekId: string;
  publishedAt: string;
  aiLabel: StoredReport["aiLabel"];
  visibilityTier: StoredReport["visibilityTier"];
  premiumOnly: boolean;
  hitlReviewerId?: string;
  summary: string;
  gated: boolean;
  sections: GatedSection[];
}

// 구독 게이팅 — 전체 열람권이 없으면 요약 + 둘째 섹션 일부만, 나머지는 잠금
function gate(report: StoredReport, tier?: string | null): GatedReport {
  const full = !report.premiumOnly || isPremium(tier);
  const sections: GatedSection[] = report.sections.map((s, i) => {
    if (full || s.key === "summary") return { ...s, locked: false };
    if (i === 1) {
      const teaser = s.content.length > 180 ? `${s.content.slice(0, 180)}…` : s.content;
      return { ...s, content: teaser, locked: false, truncated: s.content.length > 180 };
    }
    return { key: s.key, title: s.title, content: "", sources: [], locked: true };
  });
  return {
    weekId: report.weekId,
    publishedAt: report.publishedAt,
    aiLabel: report.aiLabel,
    visibilityTier: report.visibilityTier,
    premiumOnly: report.premiumOnly,
    summary: report.summary,
    gated: !full,
    sections,
  };
}

export function buildPipeline(env: Env): WeeklyReportPipeline {
  const ai = new WorkersAiLlmClient({ ai: env.AI! });
  const limitKrw = Number(env.MONTHLY_COST_LIMIT_KRW ?? "300000") || 300000;
  const recorder = new DefaultCostRecorder(new InMemoryCostStore());
  const circuitBreaker = new CircuitBreaker(new InMemoryMonthlyQuery([]), limitKrw);
  const llm = new HybridLlmRouter({
    batchClient: ai, // 무료 경로 — batch·realtime 동일 클라이언트(Claude 미사용)
    realtimeClient: ai,
    recorder,
    circuitBreaker,
  });
  return new WeeklyReportPipeline({ llm, factsLoader: makeFactsLoader(env) });
}

// ───────────────────────── 공개 라우터 ─────────────────────────
export const reportsRouter = new Hono<{ Bindings: Env }>();

reportsRouter.get("/", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ reports: [] });
  const repo = new WeeklyReportRepo(c.env.ARCHIVE_DB);
  const list = await repo.listPublished(12);
  return c.json({
    reports: list.map((r) => ({
      weekId: r.weekId,
      summary: r.summary,
      publishedAt: r.publishedAt,
      aiLabel: r.aiLabel,
      visibilityTier: r.visibilityTier,
      premiumOnly: r.premiumOnly,
    })),
  });
});

reportsRouter.get("/latest", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ report: null });
  const repo = new WeeklyReportRepo(c.env.ARCHIVE_DB);
  const report = await repo.latestPublished();
  if (!report) return c.json({ report: null });
  return c.json({ report: gate(report, c.req.query("tier")) });
});

reportsRouter.get("/:weekId", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const repo = new WeeklyReportRepo(c.env.ARCHIVE_DB);
  const report = await repo.get(c.req.param("weekId"));
  if (!report || report.status !== "published") return c.json({ error: "not_found" }, 404);
  return c.json({ report: gate(report, c.req.query("tier")) });
});

// ───────────────────────── 관리자 라우터 ─────────────────────────
// ⚠️ PoC: 인증 미적용(reviewRouter와 동일). 운영 전 requireAuth/requireRole 적용.
export const adminReportsRouter = new Hono<{ Bindings: Env }>();

const generateSchema = z.object({ weekId: z.string().regex(/^\d{4}-W\d{2}$/).optional() });

adminReportsRouter.post("/generate", async (c) => {
  if (!c.env.AI) return c.json({ error: "ai_unbound", message: "Workers AI 바인딩 없음" }, 503);
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);

  const parsed = generateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);

  const pipeline = buildPipeline(c.env);
  const report = await pipeline.generate(parsed.data.weekId);
  const repo = new WeeklyReportRepo(c.env.ARCHIVE_DB);
  const generatedAt = new Date().toISOString();
  await repo.upsertDraft(report, generatedAt);

  return c.json({
    ok: true,
    weekId: report.weekId,
    status: "draft",
    generatedAt,
    sections: report.sections.map((s) => ({ key: s.key, title: s.title, content: s.content })),
  });
});

const publishSchema = z.object({ reviewerId: z.string().min(1).max(80) });

adminReportsRouter.post("/:weekId/publish", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const parsed = publishSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);

  const repo = new WeeklyReportRepo(c.env.ARCHIVE_DB);
  const weekId = c.req.param("weekId");
  const draft = await repo.get(weekId);
  if (!draft) return c.json({ error: "not_found", message: "초안이 없습니다. 먼저 generate 하세요." }, 404);
  if (draft.status === "published") return c.json({ error: "already_published", weekId }, 409);

  // HITL 검토자 부착 후 거버넌스 게이트
  const pipeline = buildPipeline(c.env);
  const review = await pipeline.validateForPublish({ ...draft, hitlReviewerId: parsed.data.reviewerId });
  if (!review.approved) return c.json({ ok: false, error: "governance_blocked", reasons: review.reasons }, 422);

  const publishedAt = new Date().toISOString();
  await repo.publish(weekId, parsed.data.reviewerId, review.sanitized.sections, publishedAt);

  const published = (await repo.get(weekId))!;
  const notify = await notifyReportPublished(c.env, published);

  return c.json({ ok: true, weekId, publishedAt, reviewerId: parsed.data.reviewerId, notify });
});
