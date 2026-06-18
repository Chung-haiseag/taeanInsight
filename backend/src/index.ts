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
import { newsRouter } from "./news/router";
import { archiveRouter } from "./archive/router";
import { ebookReviewRouter } from "./archive/ebook_review";
import { copilotRouter } from "./copilot/router";
import { queryRouter } from "./query/router";
import { envRouter } from "./env/router";
import { reportsRouter, adminReportsRouter } from "./reports/router";
import { pushRouter } from "./notifications/router";
import { govRouter } from "./gov/router";

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
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

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
app.route("/api/admin/ebook", ebookReviewRouter);
app.route("/api/news", newsRouter);
app.route("/api/archive", archiveRouter);
app.route("/api/copilot", copilotRouter);
app.route("/api/query", queryRouter);
app.route("/api/conditions", envRouter);
app.route("/api/reports", reportsRouter);
app.route("/api/admin/reports", adminReportsRouter);
app.route("/api/push", pushRouter);
app.route("/api/gov", govRouter);

// HTTP 요청 핸들러 + Scheduled 핸들러
export default {
  fetch: app.fetch,

  // Cron:
  //  · "0 13 * * 4" (목 22:00 KST) — 주간 리포트 초안 생성(Workers AI). 발행은 HITL 검토 후 수동.
  //  · "0 15 * * *" (매일 00:00 KST) — 뉴스 적재 + 환경 스냅샷 + 비용 집계.
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // ── 주간 리포트 초안 (목 야간) ──
    if (_event.cron === "0 13 * * 4") {
      try {
        if (env.AI && env.ARCHIVE_DB) {
          const [{ buildWeeklyDraft }] = await Promise.all([import("./reports/scheduled")]);
          const r = await buildWeeklyDraft(env);
          console.log(`[cron] 주간 리포트 초안 생성: ${r.weekId} (${r.sections}개 섹션)`);
        }
      } catch (e) {
        console.warn("[cron] 주간 리포트 초안 실패:", e instanceof Error ? e.message : e);
      }
      return; // 주간 cron은 초안 생성만 수행
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
    // 군청 게시판 수집은 한국 IP 로컬 크롤러(tools/gov/ingest-gov.mjs)가 수행 →
    // /api/gov/import로 적재. (taean.go.kr 기사 view가 Worker 송신 IP에 500 반환하여 Worker fetch 불가.)
    const { runHourlyAggregation } = await import("./cost/scheduled");
    await runHourlyAggregation(env);
  },
};
