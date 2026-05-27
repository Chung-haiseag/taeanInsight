// 서킷 브레이커 — 월 누적 비용이 한도에 도달하면 비필수 호출 자동 차단
// PRD v1.8 §6 REQ-COST-001

import type { CostEvent } from "../types";

export type CallPriority = "critical" | "normal" | "best_effort";

export interface CircuitBreakerDecision {
  allowed: boolean;
  reason?: string;
  monthlyTotalKrw: number;
  limitKrw: number;
  ratio: number;
}

export interface MonthlyCostQuery {
  /** 'YYYY-MM' 형식의 현재 월에 대한 모든 cost_events 합산 */
  getMonthlyTotalKrw(month: string): Promise<number>;
}

export class CircuitBreaker {
  constructor(
    private query: MonthlyCostQuery,
    private limitKrw: number,
  ) {}

  /**
   * 호출 직전 체크 — 차단되면 LLM/외부 API 호출 하지 말 것.
   *
   * 정책:
   * - ratio < 1.0: 모두 허용
   * - 1.0 <= ratio < 1.1: critical만 허용 (예: 적조 알림 발송)
   * - ratio >= 1.1: critical도 차단 (운영자가 수동으로만 풀 수 있게)
   */
  async check(priority: CallPriority): Promise<CircuitBreakerDecision> {
    const month = currentMonth();
    const total = await this.query.getMonthlyTotalKrw(month);
    const ratio = total / this.limitKrw;

    if (ratio < 1.0) {
      return { allowed: true, monthlyTotalKrw: total, limitKrw: this.limitKrw, ratio };
    }

    if (ratio < 1.1 && priority === "critical") {
      return {
        allowed: true,
        reason: "Over limit but allowed for critical priority",
        monthlyTotalKrw: total,
        limitKrw: this.limitKrw,
        ratio,
      };
    }

    return {
      allowed: false,
      reason:
        ratio >= 1.1
          ? `Monthly cost ${total} KRW exceeds 110% of limit ${this.limitKrw} KRW — manual override required`
          : `Monthly cost ${total} KRW exceeds limit ${this.limitKrw} KRW — only critical calls allowed`,
      monthlyTotalKrw: total,
      limitKrw: this.limitKrw,
      ratio,
    };
  }
}

export function currentMonth(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

// 인메모리 쿼리 구현체 — 테스트·PoC용
export class InMemoryMonthlyQuery implements MonthlyCostQuery {
  constructor(public events: CostEvent[] = []) {}

  async getMonthlyTotalKrw(month: string): Promise<number> {
    return this.events
      .filter((e) => (e.eventAt ?? "").startsWith(month))
      .reduce((sum, e) => sum + e.amountKrw, 0);
  }
}
