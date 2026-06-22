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
import { loadReportMetrics } from "./metrics";
import { notifyReportPublished } from "./notify";
import type { ReportSection, ReportSectionKey } from "./types";
import { D1PreferencesRepo } from "../preferences/repository_d1";
import { decideVisibility, type VisibilityTier } from "../preferences/content_filter";
import type { InterestCategory, UserPreferences } from "../preferences/types";

// 섹션 → 콘텐츠 등급·관심분야 매핑 (개인화 정렬·강조용)
const SECTION_TIER: Record<ReportSectionKey, { tier: VisibilityTier; category?: InterestCategory }> = {
  summary: { tier: "critical" },
  tourism_weather: { tier: "community", category: "tourism" },
  environment: { tier: "community", category: "environment" },
  realestate: { tier: "community", category: "realestate" },
  events: { tier: "community", category: "culture" },
};

// 프리미엄(전체 열람) 등급 판별 — 비구독/익명은 미리보기
function isPremium(tier?: string | null): boolean {
  return !!tier && /(premium|b2b|b2g)/i.test(tier);
}

interface GatedSection extends ReportSection {
  locked: boolean;
  truncated?: boolean;
  emphasis?: "show" | "show_small";  // 개인화: 관심사 일치=show, 그 외=show_small
  matched?: boolean;                  // 내 관심 분야와 일치
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
  personalized?: boolean;
  interests?: InterestCategory[];
}

// 관심사 기준 섹션 재정렬·강조 — summary는 항상 최상단, 관심 분야 일치 섹션 우선
function personalize(view: GatedReport, prefs: UserPreferences | null): GatedReport {
  if (!prefs || !prefs.categories?.length) return view;
  const decorated = view.sections.map((s) => {
    const meta = SECTION_TIER[s.key] ?? { tier: "community" as VisibilityTier };
    const d = decideVisibility({ id: s.key, visibilityTier: meta.tier, category: meta.category }, prefs);
    return { ...s, emphasis: d.visibility === "show" ? ("show" as const) : ("show_small" as const), matched: meta.category ? prefs.categories.includes(meta.category) : false };
  });
  const rank = (e?: string) => (e === "show" ? 0 : 1);
  const summary = decorated.filter((s) => s.key === "summary");
  const rest = decorated.filter((s) => s.key !== "summary").sort((a, b) => rank(a.emphasis) - rank(b.emphasis));
  return { ...view, sections: [...summary, ...rest], personalized: true, interests: prefs.categories };
}

// uid(헤더 X-Taean-Uid 또는 ?uid=)로 저장된 선호도 로드
async function loadPrefs(c: { env: Env; req: { header: (k: string) => string | undefined; query: (k: string) => string | undefined } }): Promise<UserPreferences | null> {
  if (!c.env.ARCHIVE_DB) return null;
  const uid = c.req.header("X-Taean-Uid") || c.req.query("uid");
  if (!uid) return null;
  try { return await new D1PreferencesRepo(c.env.ARCHIVE_DB).get(uid); } catch { return null; }
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
  const prefs = await loadPrefs(c);
  const tier = c.req.query("tier") ?? prefs?.segment; // 등급은 선호도(저장된 세그먼트)로
  return c.json({ report: personalize(gate(report, tier), prefs) });
});

// 리포트 섹션 시각화용 정형 지표(대기질 추세·실거래 집계·축제) — 산문과 별개로 차트/표 렌더
// 엣지 캐시(Cache API) 5분: 외부 API 10여 개 팬아웃을 colo당 5분 1회로 제한(요청 간 재사용).
reportsRouter.get("/metrics", async (c) => {
  const cache = caches.default;
  const cacheKey = new Request(new URL(c.req.url).toString(), { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  // 1) cron이 미리 채운 D1 스냅샷이 신선하면 즉시 서빙(외부 API 팬아웃 회피)
  // 2) 없으면 라이브 계산(첫 부팅·스냅샷 만료 대비)
  const { getFreshSnapshot } = await import("./metrics_cache");
  const metrics = (await getFreshSnapshot(c.env)) ?? (await loadReportMetrics(c.env));
  const res = c.json({ metrics });
  res.headers.set("Cache-Control", "public, s-maxage=300");
  c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
});

// 리포트 주차의 태안신문 주요 뉴스(아카이브 기반 링크 목록) — AI 생성 아님
// 최신 리포트 조회 시 '지금'까지의 최신 기사를 보여줌(발행일에 고정 X) — 실시간성 확보.
// 과거 리포트(weekId가 최신이 아님) 조회면 그 주 창으로 한정.
reportsRouter.get("/:weekId/news", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ news: [] });
  const repo = new WeeklyReportRepo(c.env.ARCHIVE_DB);
  const weekId = c.req.param("weekId");
  const report = await repo.get(weekId);
  const latest = await repo.latestPublished();
  const isLatest = !report || !latest || report.weekId === latest.weekId;
  // 최신 리포트면 오늘 기준, 과거 리포트면 그 발행일 기준. 창은 14일(주간지 간격 여유).
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const until = isLatest ? todayKst : (report!.publishedAt || todayKst).slice(0, 10);
  const since = new Date(new Date(until).getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const r = await c.env.ARCHIVE_DB
    .prepare(
      `SELECT idxno, title, published_at, category, section FROM archive_articles
        WHERE published_at >= ?1 AND published_at <= ?2 || 'T23:59:59'
        ORDER BY published_at DESC LIMIT 200`,
    )
    .bind(since, until)
    .all<{ idxno: number; title: string; published_at: string; category: string; section: string }>();
  return c.json({
    weekId: c.req.param("weekId"),
    news: (r.results ?? []).map((x) => ({
      idxno: x.idxno,
      title: x.title,
      publishedAt: x.published_at,
      category: x.category,
      section: x.section,
    })),
  });
});

reportsRouter.get("/:weekId", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const repo = new WeeklyReportRepo(c.env.ARCHIVE_DB);
  const report = await repo.get(c.req.param("weekId"));
  if (!report || report.status !== "published") return c.json({ error: "not_found" }, 404);
  const prefs = await loadPrefs(c);
  const tier = c.req.query("tier") ?? prefs?.segment;
  return c.json({ report: personalize(gate(report, tier), prefs) });
});

// ───────────────────────── 관리자 라우터 ─────────────────────────
// ⚠️ PoC: 인증 미적용(reviewRouter와 동일). 운영 전 requireAuth/requireRole 적용.
export const adminReportsRouter = new Hono<{ Bindings: Env }>();

// metrics 스냅샷 수동 갱신(워밍) — cron과 동일. 배포 직후 즉시 채울 때.
adminReportsRouter.get("/refresh-metrics", async (c) => {
  const { refreshMetricsSnapshot } = await import("./metrics_cache");
  return c.json(await refreshMetricsSnapshot(c.env));
});

// 수요지수 백테스트 조회(예측 vs 실측 정확도) — 데이터 누적 후 의미. ?fill=1로 실측 즉시 적재.
adminReportsRouter.get("/backtest", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const { computeBacktest, fillActuals } = await import("./backtest");
  let filled: number | undefined;
  if (c.req.query("fill") === "1") filled = (await fillActuals(c.env)).filled;
  const result = await computeBacktest(c.env.ARCHIVE_DB);
  return c.json(filled !== undefined ? { ...result, filled } : result);
});

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
