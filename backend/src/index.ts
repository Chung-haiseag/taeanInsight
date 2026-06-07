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
app.route("/api/news", newsRouter);
app.route("/api/archive", archiveRouter);

// HTTP 요청 핸들러 + Scheduled 핸들러
export default {
  fetch: app.fetch,

  // 매시간 cron — 비용 집계 + 임계값 알림
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const { runHourlyAggregation } = await import("./cost/scheduled");
    await runHourlyAggregation(env);
  },
};
