// 주간 인사이트 리포트 API — REQ-PRODUCT-001 / TaskMaster #22
//   공개:   GET  /api/reports            발행분 목록
//           GET  /api/reports/latest     최신 발행분(구독 게이팅)
//           GET  /api/reports/:weekId     특정 주차(구독 게이팅)
//   관리자: POST /api/admin/reports/generate         초안 생성(Workers AI)
//           POST /api/admin/reports/:weekId/publish  HITL 검토 후 발행 + 알림
//
// LLM: Workers AI 무료 모델(운영 Worker는 Claude API 미사용). 게이팅은 ?tier= 쿼리로 판별
//   (다른 라우터와 동일한 PoC 방식 — 운영 시 JWT auth.sub/플랜으로 대체).

import { edgeCacheKey } from "../cache/key_normalizer";
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
import { getIsoWeekId } from "./types";
import { durationFromBytes, parseScript, parseIdxnos } from "./episode";
import { D1PreferencesRepo } from "../preferences/repository_d1";
import { decideVisibility, type VisibilityTier } from "../preferences/content_filter";
import type { InterestCategory, UserPreferences } from "../preferences/types";
import { isMember } from "../membership/plan";

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

// 계정 plan 기반 tier — 유료 회원이면 premium.
//   ⚠ 판정은 membership/plan.ts 한 곳에서만 한다. 예전엔 여기서 plan!=='free'만 봐서
//     **만료된 회원도 계속 열렸다**(한 번 결제하면 영원히). isMember가 만료일까지 본다.
async function planTier(c: { env: Env; req: { header: (k: string) => string | undefined } }): Promise<string | null> {
  const uid = c.req.header("X-Taean-Uid");
  if (!uid || !c.env.ARCHIVE_DB) return null;
  try {
    const u = await c.env.ARCHIVE_DB.prepare("SELECT plan, plan_until FROM users WHERE uid=?").bind(uid)
      .first<{ plan: string; plan_until: string | null }>();
    return u && isMember(u) ? "premium" : null;
  } catch { return null; }
}

// 프리미엄(결정에 쓰는 정보) 섹션 — 비구독/익명은 미리보기+업셀. 요약·환경·이벤트는 무료(공익·유입·SEO).
//   전략: 아카이브·기사는 무료 유지, 미래지향 AI 판단정보(부동산·지역경제, 관광·기상 전망)가 유료 쐐기.
const PREMIUM_SECTIONS = new Set<string>(["realestate", "tourism_weather"]);

// 구독 게이팅 — 프리미엄 섹션만 앞부분 미리보기(teaser)+'이어 보기(구독)'로. 결제 전엔 소프트(미리보기)라
//   유입을 막지 않고 수요를 검증(업셀 클릭→/membership 리드). 실결제 붙으면 서버에서 전문 withhold로 강화.
function gate(report: StoredReport, tier?: string | null): GatedReport {
  const entitled = isPremium(tier);
  const sections: GatedSection[] = report.sections.map((s) => {
    if (entitled || !PREMIUM_SECTIONS.has(s.key)) return { ...s, locked: false };
    const teaser = s.content.length > 220 ? `${s.content.slice(0, 220)}…` : s.content;
    return { ...s, content: teaser, locked: false, truncated: s.content.length > 220 };
  });
  return {
    weekId: report.weekId,
    publishedAt: report.publishedAt,
    aiLabel: report.aiLabel,
    visibilityTier: report.visibilityTier,
    premiumOnly: report.premiumOnly,
    summary: report.summary,
    gated: sections.some((s) => s.truncated || s.locked),
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
  const tier = c.req.query("tier") ?? (await planTier(c)) ?? prefs?.segment; // 등급은 선호도(저장된 세그먼트)로
  return c.json({ report: personalize(gate(report, tier), prefs) });
});

// 리포트 섹션 시각화용 정형 지표(대기질 추세·실거래 집계·축제) — 산문과 별개로 차트/표 렌더
// 엣지 캐시(Cache API) 5분: 외부 API 10여 개 팬아웃을 colo당 5분 1회로 제한(요청 간 재사용).
reportsRouter.get("/metrics", async (c) => {
  const cache = caches.default;
  const cacheKey = new Request(edgeCacheKey(c.req.url, c.env.CF_VERSION?.id), { method: "GET" });
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

// 예보 적중률(공개) — 우리 날씨 예보 vs 실제 관측. 예측 신뢰의 정직한 근거. (:weekId보다 먼저 등록)
reportsRouter.get("/forecast-accuracy", async (c) => {
  const { getForecastAccuracy } = await import("./forecast_accuracy");
  c.header("Cache-Control", "public, max-age=1800");
  return c.json(await getForecastAccuracy(c.env));
});

// GET /api/reports/:weekId/episode — 팟캐스트 회차 한 편(**공개**: 로그인 없이 듣고 읽는다).
//   회차 번호·다루는 날들·길이·대본·그 회차가 다룬 기사. 분석 리포트만 회원 전용이고 이쪽은 열어 둔다.
//   (:weekId 보다 먼저 등록해야 한다 — 아니면 'episode'가 주차 이름으로 먹힌다.)
reportsRouter.get("/:weekId/episode", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const weekId = c.req.param("weekId");
  const repo = new WeeklyReportRepo(c.env.ARCHIVE_DB);
  const report = await repo.get(weekId);
  if (!report || report.status !== "published") return c.json({ error: "not_found" }, 404);

  // 회차 번호 = 이 주차까지 발행된 리포트 수. 주차 순서로 세므로 **과거 회차 번호가 나중에 바뀌지 않는다**
  //   (R2에 오디오가 있는 주차만 세면, 지난 회차를 하나 더 만들 때 그 뒤 번호가 전부 밀린다).
  const noRow = await c.env.ARCHIVE_DB
    .prepare(`SELECT COUNT(*) AS n FROM weekly_reports WHERE status='published' AND week_id <= ?1`)
    .bind(weekId)
    .first<{ n: number }>();
  const no = Number(noRow?.n) || null;

  // 저장된 대본 — 077 적용 뒤 만든 회차만 있다. 테이블이 없거나 그 회차가 없으면 조용히 폴백한다
  //   (지난 20회차는 생성 스크립트가 대본을 버렸다 — 없는 것을 있다고 하지 않는다).
  let saved: { script: string; article_idxnos: string; duration_sec: number | null; bytes: number | null } | null = null;
  try {
    saved = await c.env.ARCHIVE_DB
      .prepare(`SELECT script, article_idxnos, duration_sec, bytes FROM podcast_scripts WHERE week_id = ?1`)
      .bind(weekId)
      .first();
  } catch {
    /* podcast_scripts 없음(077 미적용) — 폴백 */
  }

  const script = parseScript(saved?.script);
  const idxnos = parseIdxnos(saved?.article_idxnos);

  // 오디오 유무와 길이는 **결과물을 직접 보고** 판단한다(status.json은 건강 신호가 아니다 — 2026-09-05 교훈).
  const head = c.env.ARCHIVE_PHOTOS
    ? await c.env.ARCHIVE_PHOTOS.head(`audio/podcast/${weekId}-gem.mp3`).catch(() => null)
    : null;
  const durationSec = saved?.duration_sec ?? durationFromBytes(head?.size ?? saved?.bytes ?? null);

  // 다룬 기사: 대본이 적어 둔 것이 있으면 그것, 없으면 '그 주 주요 기사'로 폴백.
  //   폴백 질의는 생성기(tools/podcast/gen-podcast.mjs weeklyNews)가 실제로 먹인 것과 같은 모양이다
  //   — 발행 시점에서 본문 있는 최신 8건. 화면 제목도 scripted=false 로 바꿔 적는다.
  const cols = "idxno, title, published_at, category, lead_image";
  let rows: { idxno: number; title: string; published_at: string; category: string; lead_image: string | null }[] = [];
  if (idxnos.length) {
    const ph = idxnos.map((_, i) => `?${i + 1}`).join(",");
    const r = await c.env.ARCHIVE_DB
      .prepare(`SELECT ${cols} FROM archive_articles WHERE idxno IN (${ph})`)
      .bind(...idxnos)
      .all<(typeof rows)[number]>();
    // 대본이 다룬 순서대로 되돌린다 — D1은 IN 절 순서를 지켜 주지 않는다.
    const order = new Map(idxnos.map((n, i) => [n, i]));
    rows = (r.results ?? []).sort((a, b) => (order.get(a.idxno) ?? 0) - (order.get(b.idxno) ?? 0));
  } else {
    const until = (report.publishedAt || new Date().toISOString()).slice(0, 10);
    const r = await c.env.ARCHIVE_DB
      .prepare(
        `SELECT ${cols} FROM archive_articles
          WHERE published_at <= ?1 || 'T23:59:59' AND length(COALESCE(body,'')) > 300
          ORDER BY published_at DESC LIMIT 8`,
      )
      .bind(until)
      .all<(typeof rows)[number]>();
    rows = r.results ?? [];
  }

  const res = c.json({
    episode: {
      weekId,
      no,
      publishedAt: report.publishedAt,
      summary: report.summary,
      durationSec,
      hasAudio: !!head,
      scripted: idxnos.length > 0,
      script,
      articles: rows.map((x) => ({
        idxno: x.idxno,
        title: x.title,
        publishedAt: x.published_at,
        category: x.category,
        leadImage: x.lead_image,
      })),
    },
  });
  res.headers.set("Cache-Control", "public, s-maxage=300");
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
  const tier = c.req.query("tier") ?? (await planTier(c)) ?? prefs?.segment;
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

// 검수 화면용 — 이번 주차 리포트(초안/발행) 전문 + 거버넌스 사전검사(발행 안 함).
adminReportsRouter.get("/current", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const repo = new WeeklyReportRepo(c.env.ARCHIVE_DB);
  const report = (await repo.get(getIsoWeekId())) ?? (await repo.latestPublished());
  if (!report) return c.json({ report: null, governance: null });
  let governance: { approved: boolean; reasons: string[] } = { approved: true, reasons: [] };
  try {
    const review = await buildPipeline(c.env).validateForPublish({ ...report, hitlReviewerId: "preview" });
    governance = { approved: review.approved, reasons: review.reasons };
  } catch { /* 거버넌스 검사 실패는 무시(미리보기) */ }
  return c.json({
    report: { weekId: report.weekId, status: report.status, aiLabel: report.aiLabel, publishedAt: report.publishedAt, summary: report.summary, sections: report.sections },
    governance,
  });
});

// 발행 회수(unpublish) — published → draft. 오발행 시 즉시 비공개.
adminReportsRouter.post("/:weekId/unpublish", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const weekId = c.req.param("weekId");
  const r = await c.env.ARCHIVE_DB
    .prepare(`UPDATE weekly_reports SET status='draft', published_at=NULL, updated_at=datetime('now') WHERE week_id=?1 AND status='published'`)
    .bind(weekId)
    .run();
  return c.json({ ok: !!r.meta.changes, weekId, reverted: !!r.meta.changes });
});

// 발행본 재정제 — 저장된 섹션에서 외국문자 누수(한자 化·里的 등)만 제거.
// 재생성·재발송 없이 즉시 정리(내용·발행상태·publishedAt 유지). 이미 발행된 리포트의 누수 수정용.
adminReportsRouter.post("/:weekId/sanitize", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const weekId = c.req.param("weekId");
  const repo = new WeeklyReportRepo(c.env.ARCHIVE_DB);
  const report = await repo.get(weekId);
  if (!report) return c.json({ error: "not_found" }, 404);

  const { stripForeignLetters, isGarbledAnswer } = await import("../query/answer_quality");
  let changed = 0;
  const sections = report.sections.map((s) => {
    if (isGarbledAnswer(s.content)) {
      const cleaned = stripForeignLetters(s.content);
      if (cleaned && cleaned !== s.content) { changed++; return { ...s, content: cleaned }; }
    }
    return s;
  });
  if (changed === 0) return c.json({ ok: true, weekId, changedSections: 0, note: "누수 없음" });

  const summary = sections.find((s) => s.key === "summary")?.content ?? report.summary;
  await c.env.ARCHIVE_DB
    .prepare(`UPDATE weekly_reports SET sections=?2, summary=?3, updated_at=datetime('now') WHERE week_id=?1`)
    .bind(weekId, JSON.stringify(sections), summary)
    .run();
  return c.json({ ok: true, weekId, changedSections: changed });
});

// 단일 섹션 재생성 — 발행본의 한 섹션만 최신 프롬프트·사실로 다시 생성해 교체(발행 상태·타 섹션 보존).
//   예: 대기질 표기 규칙 변경 후 이미 발행된 회차의 '환경 모니터링'만 갱신.
const regenSectionSchema = z.object({ key: z.enum(["summary", "tourism_weather", "environment", "realestate", "events"]) });

adminReportsRouter.post("/:weekId/regenerate-section", async (c) => {
  if (!c.env.AI) return c.json({ error: "ai_unbound", message: "Workers AI 바인딩 없음" }, 503);
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const weekId = c.req.param("weekId");
  const parsed = regenSectionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);

  const repo = new WeeklyReportRepo(c.env.ARCHIVE_DB);
  const report = await repo.get(weekId);
  if (!report) return c.json({ error: "not_found" }, 404);

  const regen = await buildPipeline(c.env).regenerateSection(weekId, parsed.data.key);
  if (!regen) return c.json({ error: "no_plan" }, 400);

  const sections = report.sections.map((s) => (s.key === parsed.data.key ? { ...s, content: regen.content } : s));
  const summary = sections.find((s) => s.key === "summary")?.content ?? report.summary;
  await c.env.ARCHIVE_DB
    .prepare(`UPDATE weekly_reports SET sections=?2, summary=?3, updated_at=datetime('now') WHERE week_id=?1`)
    .bind(weekId, JSON.stringify(sections), summary)
    .run();
  return c.json({ ok: true, weekId, key: parsed.data.key, status: report.status, content: regen.content });
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

// 자동발행 설정 조회/변경 + 수동 자동발행 트리거
adminReportsRouter.get("/autopublish", async (c) => {
  const { getAutoPublish } = await import("./scheduled");
  return c.json({ enabled: await getAutoPublish(c.env) });
});
adminReportsRouter.post("/autopublish", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { enabled?: boolean };
  const { setAutoPublish, getAutoPublish } = await import("./scheduled");
  if (typeof body.enabled === "boolean") await setAutoPublish(c.env, body.enabled);
  return c.json({ enabled: await getAutoPublish(c.env) });
});
adminReportsRouter.post("/autopublish/run", async (c) => {
  const { autoPublishIfClean } = await import("./scheduled");
  return c.json(await autoPublishIfClean(c.env));
});

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
