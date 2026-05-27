// #21 OAuth2 SSO + Toss Payments 단위 테스트

import { describe, expect, it } from "vitest";

import { signJwt, verifyJwt } from "../src/auth/jwt";
import {
  InMemorySubscriptionRepo,
  PLAN_PRICE_KRW,
  SubscriptionService,
} from "../src/payments/subscriptions";
import { TossPayments } from "../src/payments/toss";

const SECRET = "test-secret-please-change";

// ---------- JWT ----------

describe("JWT 발급·검증", () => {
  it("access 토큰 정상 검증", async () => {
    const token = await signJwt({ sub: "u-1", role: "b2c_premium", email: "x@y" }, "access", SECRET);
    const payload = await verifyJwt(token, SECRET);
    expect(payload?.sub).toBe("u-1");
    expect(payload?.role).toBe("b2c_premium");
    expect(payload?.type).toBe("access");
  });

  it("refresh 토큰 정상 검증 + 1주 만료", async () => {
    const token = await signJwt({ sub: "u-1", role: "b2c_basic" }, "refresh", SECRET);
    const payload = await verifyJwt(token, SECRET);
    expect(payload?.type).toBe("refresh");
    const ttl = (payload!.exp - payload!.iat);
    expect(ttl).toBe(7 * 24 * 3600);
  });

  it("위조된 시크릿으로는 검증 실패", async () => {
    const token = await signJwt({ sub: "u-1", role: "b2c_basic" }, "access", SECRET);
    expect(await verifyJwt(token, "wrong-secret")).toBeNull();
  });

  it("형식이 잘못된 토큰", async () => {
    expect(await verifyJwt("not.a.token", SECRET)).toBeNull();
    expect(await verifyJwt("only-two.parts", SECRET)).toBeNull();
  });
});

// ---------- Subscription Service ----------

// Toss API를 fake로 대체 — 실제 외부 호출 없이 동작 검증
class FakeToss extends TossPayments {
  constructor() {
    super({ secretKey: "test", baseUrl: "https://fake" });
  }
  issueBillingKey = async () => ({
    billingKey: "bk_test_1",
    cardNumber: "1234-****-****-5678",
    customerKey: "ck_test_1",
  });
  chargeBilling = async () => ({
    paymentKey: "pk_1",
    orderId: "ord_1",
    totalAmount: 15000,
    approvedAt: new Date().toISOString(),
    method: "카드",
    status: "DONE" as const,
  });
}

describe("SubscriptionService", () => {
  it("B2C Premium 구독 생성 — 빌링키 발급 + 첫 결제 + DB 적재", async () => {
    const repo = new InMemorySubscriptionRepo();
    const svc = new SubscriptionService(repo, new FakeToss());
    const rec = await svc.createSubscription({
      userId: crypto.randomUUID(),
      plan: "b2c_premium",
      authKey: "authKey-from-client",
      customerKey: "ck_test_1",
    });
    expect(rec.plan).toBe("b2c_premium");
    expect(rec.status).toBe("active");
    expect(rec.monthlyPriceKrw).toBe(15_000);
    expect(rec.pgSubscriptionId).toBe("bk_test_1");
  });

  it("이미 활성 구독이 있으면 거부", async () => {
    const repo = new InMemorySubscriptionRepo();
    const svc = new SubscriptionService(repo, new FakeToss());
    const userId = crypto.randomUUID();
    await svc.createSubscription({ userId, plan: "b2c_premium", authKey: "a", customerKey: "c" });

    await expect(
      svc.createSubscription({ userId, plan: "b2c_basic", authKey: "a2", customerKey: "c" }),
    ).rejects.toThrowError("active_subscription_already_exists");
  });

  it("B2G 플랜은 자동 결제 불가 (별도 협의)", async () => {
    const repo = new InMemorySubscriptionRepo();
    const svc = new SubscriptionService(repo, new FakeToss());
    await expect(
      svc.createSubscription({ userId: crypto.randomUUID(), plan: "b2g", authKey: "a", customerKey: "c" }),
    ).rejects.toThrowError("plan_b2g_requires_manual_setup");
  });

  it("가격 정책 (v1.3)", () => {
    expect(PLAN_PRICE_KRW.b2c_basic).toBe(5_000);
    expect(PLAN_PRICE_KRW.b2c_premium).toBe(15_000);
    expect(PLAN_PRICE_KRW.b2b_basic).toBe(30_000);
    expect(PLAN_PRICE_KRW.b2b_premium).toBe(80_000);
  });

  it("해지 시 상태가 cancelled로 전환", async () => {
    const repo = new InMemorySubscriptionRepo();
    const svc = new SubscriptionService(repo, new FakeToss());
    const rec = await svc.createSubscription({
      userId: crypto.randomUUID(),
      plan: "b2c_basic",
      authKey: "a",
      customerKey: "c",
    });
    await svc.cancelSubscription(rec.id);
    const updated = repo.records.get(rec.id);
    expect(updated?.status).toBe("cancelled");
    expect(updated?.cancelledAt).toBeTruthy();
  });
});
