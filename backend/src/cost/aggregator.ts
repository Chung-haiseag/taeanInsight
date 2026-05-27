// 월 누적 비용 집계 + 임계값 알림
// 매시간 cron 으로 실행 (wrangler.jsonc triggers.crons = ["0 * * * *"])
// PRD v1.8 §6 REQ-COST-001

import type { CostCategory, CostEvent, MonthlyCostReport } from "../types";
import { currentMonth } from "./circuit_breaker";

export interface AggregatorStore {
  /** 해당 월의 모든 cost_events 조회 */
  listEvents(month: string): Promise<CostEvent[]>;

  /** 이번 달에 이미 알림 발송한 임계값 목록 (중복 발송 방지) */
  getNotifiedThresholds(month: string): Promise<number[]>;

  /** 새 임계값 알림 발송 기록 */
  markNotified(month: string, threshold: number): Promise<void>;
}

export interface Notifier {
  /** 임계값 도달 알림 (Slack·이메일 등) */
  notifyThresholdCrossed(report: MonthlyCostReport, threshold: number): Promise<void>;
}

export class CostAggregator {
  constructor(
    private store: AggregatorStore,
    private notifier: Notifier,
    private limitKrw: number,
    private thresholds: number[],
  ) {}

  async run(now: Date = new Date()): Promise<MonthlyCostReport> {
    const month = currentMonth(now);
    const events = await this.store.listEvents(month);
    const report = this.buildReport(month, events);

    // 이번 달에 아직 알림 안 한 임계값 중 이번에 넘은 것 찾기
    const already = new Set(await this.store.getNotifiedThresholds(month));
    const newlyCrossed = this.thresholds.filter(
      (t) => report.ratio >= t && !already.has(t),
    );

    for (const t of newlyCrossed) {
      await this.notifier.notifyThresholdCrossed(report, t);
      await this.store.markNotified(month, t);
    }

    report.thresholdsCrossed = this.thresholds.filter((t) => report.ratio >= t);
    return report;
  }

  private buildReport(month: string, events: CostEvent[]): MonthlyCostReport {
    const totalKrw = events.reduce((sum, e) => sum + e.amountKrw, 0);
    const byCategory = {} as Record<CostCategory, number>;
    const byVendor: Record<string, number> = {};

    for (const e of events) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amountKrw;
      byVendor[e.vendor] = (byVendor[e.vendor] ?? 0) + e.amountKrw;
    }

    return {
      month,
      totalKrw: Number(totalKrw.toFixed(4)),
      limitKrw: this.limitKrw,
      ratio: this.limitKrw > 0 ? totalKrw / this.limitKrw : 0,
      byCategory,
      byVendor,
      thresholdsCrossed: [],
    };
  }
}

// Slack Webhook 기반 Notifier
export class SlackNotifier implements Notifier {
  constructor(private webhookUrl: string) {}

  async notifyThresholdCrossed(report: MonthlyCostReport, threshold: number): Promise<void> {
    const pct = Math.round(threshold * 100);
    const total = Math.round(report.totalKrw).toLocaleString("ko-KR");
    const limit = report.limitKrw.toLocaleString("ko-KR");
    const lines = [
      `:warning: *비용 ${pct}% 도달 — ${report.month}*`,
      `누적 비용: *${total}원 / ${limit}원* (${(report.ratio * 100).toFixed(1)}%)`,
      "",
      "*카테고리별:*",
      ...Object.entries(report.byCategory)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, amt]) => `• ${cat}: ${Math.round(amt).toLocaleString("ko-KR")}원`),
      "",
      threshold >= 1.0
        ? ":octagonal_sign: *서킷 브레이커 활성화* — 비필수 호출 차단됨"
        : "_캐싱 정책·배치 비중 점검 권장_",
    ];

    await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
    });
  }
}

// 콘솔 Notifier — 로컬 개발·테스트용
export class ConsoleNotifier implements Notifier {
  notifyThresholdCrossed(report: MonthlyCostReport, threshold: number): Promise<void> {
    console.warn(
      `[cost-alert] ${Math.round(threshold * 100)}% reached — month=${report.month} total=${report.totalKrw} ratio=${report.ratio.toFixed(3)}`,
    );
    return Promise.resolve();
  }
}
