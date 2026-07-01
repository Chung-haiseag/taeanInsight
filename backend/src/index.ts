// 태안 인사이트 백엔드 API 엔트리포인트
// Hono on Cloudflare Workers + Cron 트리거
// PRD v1.8 §8 기술 아키텍처

import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Env } from "./types";
import { costRouter } from "./cost/router";
import { meRouter } from "./preferences/router";
import { addonsRouter } from "./payments/addons_router";
import { reviewRouter } from "./governance/review_router";
import { rulesRouter } from "./governance/rules_router";
import { citizenRouter } from "./citizen/router";
import { citizenArticlesRouter } from "./citizen/articles_router";
import { dashboardRouter } from "./dashboard/router";
import { newsRouter } from "./news/router";
import { archiveRouter } from "./archive/router";
import { ebookReviewRouter } from "./archive/ebook_review";
import { copilotRouter } from "./copilot/router";
import { queryRouter } from "./query/router";
import { readingRouter } from "./reading/router";
import { reporterRouter } from "./reporter/router";
import { audioRouter } from "./audio/router";
import { analyticsRouter } from "./analytics/router";
import { authRouter } from "./auth/router";
import { envRouter } from "./env/router";
import { reportsRouter, adminReportsRouter } from "./reports/router";
import { pushRouter } from "./notifications/router";
import { govRouter } from "./gov/router";
import { emailRouter } from "./email/router";

const app = new Hono<{ Bindings: Env }>();

// CORS — 프론트엔드(workers.dev 임시 도메인 + 운영 도메인)에서 호출 허용
app.use(
  "/api/*",
  cors({
    origin: (origin) =>
      /^https?:\/\/(localhost(:\d+)?|.*\.workers\.dev|.*\.taeannews\.co\.kr)$/.test(origin)
        ? origin
        : "",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Taean-Uid", "X-Admin-Token"],
    maxAge: 86400,
  }),
);

// 관리자 보호 — /api/admin/*·/api/cost 는 ADMIN_TOKEN(X-Admin-Token 헤더) 필요.
// 미설정이면 보안상 잠금(503). 발행·검수·거버넌스·비용을 무인증 노출하지 않는다.
const adminGuard = async (c: { req: { method: string; header: (k: string) => string | undefined }; env: Env; json: (b: unknown, s?: number) => Response }, next: () => Promise<void>) => {
  if (c.req.method === "OPTIONS") return next();
  const expected = c.env.ADMIN_TOKEN;
  if (!expected) return c.json({ error: "admin_not_configured", hint: "Set ADMIN_TOKEN secret" }, 503);
  if (c.req.header("X-Admin-Token") !== expected) return c.json({ error: "unauthorized" }, 401);
  return next();
};
app.use("/api/admin/*", adminGuard);
app.use("/api/cost/*", adminGuard);

app.get("/", (c) => c.json({ name: "taean-insight-api", version: "0.1.0" }));

app.get("/health", (c) =>
  c.json({
    ok: true,
    env: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  }),
);

app.route("/api/cost", costRouter);
app.route("/api/me", meRouter);
app.route("/api/addons", addonsRouter);
app.route("/api/admin/review", reviewRouter);
app.route("/api/admin/rules", rulesRouter);
app.route("/api/admin/citizen", citizenRouter);
app.route("/api/citizen/articles", citizenArticlesRouter);
app.route("/api/admin/ebook", ebookReviewRouter);
app.route("/api/news", newsRouter);
app.route("/api/archive", archiveRouter);
app.route("/api/dashboard", dashboardRouter);
app.route("/api/copilot", copilotRouter);
app.route("/api/query", queryRouter);
app.route("/api/reading", readingRouter);
app.route("/api/reporter", reporterRouter);
app.route("/api/audio", audioRouter);
app.route("/api/admin/analytics", analyticsRouter);
app.route("/api/auth", authRouter);
app.route("/api/conditions", envRouter);
app.route("/api/reports", reportsRouter);
app.route("/api/admin/reports", adminReportsRouter);
app.route("/api/push", pushRouter);
app.route("/api/gov", govRouter);
app.route("/api/email", emailRouter);

// HTTP 요청 핸들러 + Scheduled 핸들러
export default {
  fetch: app.fetch,

  // Cron:
  //  · "0 13 * * 4" (목 22:00 KST) — 주간 리포트 초안 생성(Workers AI). 발행은 HITL 검토 후 수동.
  //  · "0 15 * * *" (매일 00:00 KST) — 뉴스 적재 + 환경 스냅샷 + 비용 집계.
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // ── 주간 리포트 초안 (금 16:00 KST) — 검토·발행은 17시 편집부 수동 ──
    if (_event.cron === "0 7 * * 5") {
      // 생성 전에 군청 목록(제목·날짜·링크) 먼저 갱신 → 초안에 최신 군정 반영
      try {
        const { crawlGovLists } = await import("./gov/list_crawler");
        const g = await crawlGovLists(env);
        const n = g.reduce((s, b) => s + b.upserted, 0);
        if (n) console.log(`[cron] 군청 목록 갱신: ${n}건`);
      } catch (e) {
        console.warn("[cron] 군청 목록 실패:", e instanceof Error ? e.message : e);
      }
      try {
        if (env.AI && env.ARCHIVE_DB) {
          const { buildWeeklyDraft, autoPublishIfClean } = await import("./reports/scheduled");
          const r = await buildWeeklyDraft(env);
          console.log(`[cron] 주간 리포트 초안 생성: ${r.weekId} (${r.sections}개 섹션)`);
          // B안 — 거버넌스 통과 시 자동 발행(off면 초안 유지, 막히면 사람 검토)
          const ap = await autoPublishIfClean(env, r.weekId);
          if (ap.published) console.log(`[cron] 주간 리포트 자동발행: ${ap.weekId}`);
          else console.log(`[cron] 자동발행 보류: ${ap.skipped ?? (ap.reasons ? `거버넌스(${ap.reasons.join(",")})` : "?")}`);
        }
      } catch (e) {
        console.warn("[cron] 주간 리포트 초안/발행 실패:", e instanceof Error ? e.message : e);
      }
      return;
    }

    // ── 주간 개인화 푸시 (금 09:00 KST) — 구독자에게 본인 업종 보드/여행 플래너 요약 ──
    if (_event.cron === "0 0 * * 5") {
      try {
        const { sendWeeklyOwnerPush } = await import("./owner/weekly_push");
        const r = await sendWeeklyOwnerPush(env);
        console.log(`[cron] 주간 개인화 푸시: 사용자 ${r.users}·발송 ${r.sent}${r.skipped ? ` (${r.skipped})` : ""}`);
      } catch (e) {
        console.warn("[cron] 주간 개인화 푸시 실패:", e instanceof Error ? e.message : e);
      }
      return;
    }

    // ── 12시간마다 — 뉴스 수집 + 군청 목록 갱신(하루 2회) ──
    if (_event.cron === "0 */12 * * *") {
      try {
        const { ingestToArchive } = await import("./news/ingest");
        const r = await ingestToArchive(env);
        if (r.inserted || r.upgraded) console.log(`[cron12h] 뉴스: 신규 ${r.inserted}·전문화 ${r.upgraded}/${r.fetched}`);
      } catch (e) { console.warn("[cron12h] 뉴스 실패:", e instanceof Error ? e.message : e); }
      try {
        const { crawlGovLists } = await import("./gov/list_crawler");
        const g = await crawlGovLists(env);
        const n = g.reduce((s, b) => s + b.upserted, 0);
        if (n) console.log(`[cron12h] 군청 목록: ${n}건`);
      } catch (e) { console.warn("[cron12h] 군청 목록 실패:", e instanceof Error ? e.message : e); }
      // 카드뉴스 이미지는 군청이 Worker(데이터센터) IP의 상세페이지를 차단 → 로컬 크롤러(launchd)가 담당.
      // 독자 맥락 추천(Phase 2): 최근 기사 임베딩을 Vectorize에 적재(신규 반영, 멱등 upsert).
      try {
        const { embedRecentArticles } = await import("./reading/router");
        const e = await embedRecentArticles(env, 80, 30);
        if (e.embedded) console.log(`[cron12h] 기사 임베딩: ${e.embedded}건`);
      } catch (e) { console.warn("[cron12h] 임베딩 실패:", e instanceof Error ? e.message : e); }
      return;
    }

    // ── 30분마다 — 리포트 metrics 스냅샷 갱신(요청 경로 외부 API 팬아웃 제거) ──
    if (_event.cron === "*/30 * * * *") {
      try {
        const { refreshMetricsSnapshot } = await import("./reports/metrics_cache");
        const r = await refreshMetricsSnapshot(env);
        if (r.ok) console.log("[cron] metrics 스냅샷 갱신");
      } catch (e) {
        console.warn("[cron] metrics 스냅샷 실패:", e instanceof Error ? e.message : e);
      }
      // 태안뉴스 목록 캐시 워밍(첫 방문 콜드 3s 방지)
      try {
        if (env.ARCHIVE_DB) {
          const { getNews, writeNewsCache } = await import("./news/ingest");
          await writeNewsCache(env.ARCHIVE_DB, await getNews(true));
          console.log("[cron] 뉴스 캐시 워밍");
        }
      } catch (e) {
        console.warn("[cron] 뉴스 캐시 워밍 실패:", e instanceof Error ? e.message : e);
      }
      // 해무 스틸컷 캐시 워밍(외부 API ~9s 콜드 방지)
      try {
        const { refreshSeafogCache } = await import("./env/seafog");
        await refreshSeafogCache(env);
        console.log("[cron] 해무 캐시 워밍");
      } catch (e) {
        console.warn("[cron] 해무 캐시 워밍 실패:", e instanceof Error ? e.message : e);
      }
      // 기자 취재 알림 — 트리거 점검(멱등, 신규분만 발송)
      try {
        const { runReporterAlerts } = await import("./reporter/alerts");
        const ra = await runReporterAlerts(env);
        if (ra.fresh) console.log(`[cron] 취재 알림: 신규 ${ra.fresh}·발송 ${ra.sent}`);
      } catch (e) {
        console.warn("[cron] 취재 알림 실패:", e instanceof Error ? e.message : e);
      }
      return;
    }

    // ── 아침(07:00 KST) — 환경·안전 자동 알림(위험 임계 초과 시 통합 푸시) ──
    if (_event.cron === "0 22 * * *") {
      try {
        const { runEnvAlerts } = await import("./notifications/env_alerts");
        const r = await runEnvAlerts(env);
        console.log(`[cron] 환경·안전 알림: 경보 ${r.alerts}건, 발송 ${r.sent}${r.skipped ? ` (${r.skipped})` : ""}`);
      } catch (e) {
        console.warn("[cron] 환경·안전 알림 실패:", e instanceof Error ? e.message : e);
      }
      return;
    }

    // ── 정오(12:00 KST) — 환경 스냅샷만 갱신해 그날 env_daily를 낮 대표값으로 덮어씀 ──
    // (자정 스냅샷은 전날 23시 관측이라 습도가 과대평가됨 → 정오값으로 보정)
    if (_event.cron === "0 3 * * *") {
      try {
        const { snapshotEnv } = await import("./env/router");
        const s = await snapshotEnv(env);
        if (s.stored) console.log("[cron] 환경 스냅샷(정오) 갱신됨");
      } catch (e) {
        console.warn("[cron] 환경 스냅샷(정오) 실패:", e instanceof Error ? e.message : e);
      }
      return;
    }

    try {
      const { ingestToArchive } = await import("./news/ingest");
      const r = await ingestToArchive(env);
      if (r.inserted || r.upgraded) console.log(`[cron] 뉴스: 신규 ${r.inserted} · 전문화 ${r.upgraded}/${r.fetched}`);
    } catch (e) {
      console.warn("[cron] 뉴스 적재 실패:", e instanceof Error ? e.message : e);
    }
    try {
      const { snapshotEnv } = await import("./env/router");
      const s = await snapshotEnv(env);
      if (s.stored) console.log("[cron] 환경 스냅샷 저장됨");
    } catch (e) {
      console.warn("[cron] 환경 스냅샷 실패:", e instanceof Error ? e.message : e);
    }
    // 관광 수요지수 로그 — 다가오는 주말 지수를 누적 저장(예보 갱신 추적·백테스트 기반)
    try {
      const { logDemand } = await import("./tour/demand_log");
      const r = await logDemand(env);
      if (r.logged) console.log(`[cron] 관광 수요지수: ${r.weekend} ${r.index}점(${r.level})`);
    } catch (e) {
      console.warn("[cron] 수요지수 로그 실패:", e instanceof Error ? e.message : e);
    }
    // 백테스트 실측 채우기 — 지난 주말의 검색관심도를 actual_search에 적재
    try {
      const { fillActuals } = await import("./reports/backtest");
      const r = await fillActuals(env);
      if (r.filled) console.log(`[cron] 백테스트 실측 적재: ${r.filled}주`);
    } catch (e) {
      console.warn("[cron] 백테스트 실측 적재 실패:", e instanceof Error ? e.message : e);
    }
    // 군청 목록(제목·날짜·링크) 매일 자동 갱신 — 목록 페이지는 Worker에서 200으로 열림.
    // 본문·카드뉴스 이미지는 한국 IP 로컬 크롤러(tools/gov/ingest-gov.mjs)가 보충(있으면 보존).
    try {
      const { crawlGovLists } = await import("./gov/list_crawler");
      const g = await crawlGovLists(env);
      const n = g.reduce((s, b) => s + b.upserted, 0);
      if (n) console.log(`[cron] 군청 목록 갱신: ${n}건`);
    } catch (e) {
      console.warn("[cron] 군청 목록 실패:", e instanceof Error ? e.message : e);
    }
    const { runHourlyAggregation } = await import("./cost/scheduled");
    await runHourlyAggregation(env);
  },
};
