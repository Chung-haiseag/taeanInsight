// 구독 관리 — Toss 빌링키 + DB 'subscriptions' 테이블 연동 (001 마이그레이션)
// PRD v1.8 §6 REQ-PLATFORM-002

import type { TossPayments } from "./toss";

export type SubscriptionPlan = "b2c_basic" | "b2c_premium" | "b2b_basic" | "b2b_premium" | "b2g";
export type SubscriptionStatus = "active" | "paused" | "cancelled" | "past_due";

export interface SubscriptionRecord {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: string;
  currentPeriodEnd: string;
  cancelledAt?: string;
  monthlyPriceKrw: number;
  pgSubscriptionId?: string;      // toss billingKey
}

// 가격 정책 — PRD §3 v1.3
export const PLAN_PRICE_KRW: Record<SubscriptionPlan, number> = {
  b2c_basic: 5_000,
  b2c_premium: 15_000,
  b2b_basic: 30_000,
  b2b_premium: 80_000,
  b2g: 0,                         // 별도 협의 (Phase 3 후 결정)
};

export interface SubscriptionRepository {
  create(record: SubscriptionRecord): Promise<void>;
  findActiveByUserId(userId: string): Promise<SubscriptionRecord | null>;
  updateStatus(id: string, status: SubscriptionStatus): Promise<void>;
  setPgSubscriptionId(id: string, pgId: string): Promise<void>;
}

export interface CreateSubscriptionInput {
  userId: string;
  plan: SubscriptionPlan;
  authKey: string;                // 토스 인증키 (클라이언트 SDK에서 발급)
  customerKey: string;            // 고객 식별자 (사용자 UUID)
}

export class SubscriptionService {
  constructor(
    private repo: SubscriptionRepository,
    private toss: TossPayments,
  ) {}

  /**
   * 구독 시작 — 빌링키 발급 + 첫 결제 + DB 적재
   */
  async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionRecord> {
    // 동시 활성 구독 방지
    const existing = await this.repo.findActiveByUserId(input.userId);
    if (existing) {
      throw new Error("active_subscription_already_exists");
    }

    const amount = PLAN_PRICE_KRW[input.plan];
    if (amount <= 0) {
      throw new Error(`plan_${input.plan}_requires_manual_setup`);
    }

    // 1) 빌링키 발급
    const billing = await this.toss.issueBillingKey({
      authKey: input.authKey,
      customerKey: input.customerKey,
    });

    // 2) 첫 결제
    const orderId = `sub_${input.userId.slice(0, 8)}_${Date.now()}`;
    await this.toss.chargeBilling({
      billingKey: billing.billingKey,
      customerKey: input.customerKey,
      amount,
      orderId,
      orderName: `태안 인사이트 ${planLabel(input.plan)} 구독`,
    });

    // 3) DB 적재
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

    const record: SubscriptionRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      plan: input.plan,
      status: "active",
      startedAt: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      monthlyPriceKrw: amount,
      pgSubscriptionId: billing.billingKey,
    };
    await this.repo.create(record);
    return record;
  }

  /** 구독 해지 — 토스 빌링키는 보관, DB 상태만 cancelled */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.repo.updateStatus(subscriptionId, "cancelled");
  }
}

function planLabel(plan: SubscriptionPlan): string {
  return {
    b2c_basic: "Basic",
    b2c_premium: "Premium",
    b2b_basic: "B2B 기본",
    b2b_premium: "B2B 프리미엄",
    b2g: "B2G",
  }[plan];
}

// 인메모리 구현체 (테스트·PoC)
export class InMemorySubscriptionRepo implements SubscriptionRepository {
  records = new Map<string, SubscriptionRecord>();

  async create(record: SubscriptionRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async findActiveByUserId(userId: string): Promise<SubscriptionRecord | null> {
    for (const r of this.records.values()) {
      if (r.userId === userId && r.status === "active") return r;
    }
    return null;
  }

  async updateStatus(id: string, status: SubscriptionStatus): Promise<void> {
    const r = this.records.get(id);
    if (r) {
      r.status = status;
      if (status === "cancelled") r.cancelledAt = new Date().toISOString();
    }
  }

  async setPgSubscriptionId(id: string, pgId: string): Promise<void> {
    const r = this.records.get(id);
    if (r) r.pgSubscriptionId = pgId;
  }
}
