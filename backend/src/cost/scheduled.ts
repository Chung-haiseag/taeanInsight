// Cron 핸들러 — 매시간 비용 집계 + 임계값 알림
// wrangler.jsonc triggers.crons = ["0 * * * *"]

import type { Env } from "../types";
import { CostAggregator, ConsoleNotifier, SlackNotifier } from "./aggregator";

// 영구 저장소 추상화. 초기에는 인메모리이지만 D1/Postgres 연결되면 여기를 교체.
export async function runHourlyAggregation(env: Env): Promise<void> {
  const limitKrw = Number(env.MONTHLY_COST_LIMIT_KRW);
  const thresholds = env.ALERT_THRESHOLDS.split(",").map(Number);
  const notifier = env.SLACK_WEBHOOK_URL
    ? new SlackNotifier(env.SLACK_WEBHOOK_URL)
    : new ConsoleNotifier();

  const aggregator = new CostAggregator(
    {
      // TODO: D1/Postgres 연결 후 SELECT 쿼리로 교체
      listEvents: async () => [],
      getNotifiedThresholds: async () => [],
      markNotified: async () => {},
    },
    notifier,
    limitKrw,
    thresholds,
  );

  const report = await aggregator.run();
  console.log(
    `[cron] hourly aggregation done — month=${report.month} total=${report.totalKrw} ratio=${report.ratio.toFixed(3)}`,
  );
}
