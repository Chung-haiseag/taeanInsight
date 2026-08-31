import { describe, it, expect } from "vitest";
import { summarizeFunnel } from "../src/report/funnel";

// 왜 다시 짰나(2026-09-01 실측):
//   퍼널 보고서가 '신청'으로 `subscription_leads`를 세고 있었다. 그런데 2026-08-25에
//   실결제로 바꾸면서 주문은 `membership_orders`로 들어간다 — **아무도 안 쓰는 표를 세고 있었다**.
//   주문이 실제로 들어와도 관리자 화면엔 영원히 0으로 보인다.
//   그리고 CTA는 '로그아웃 상태에서 로그인 관문에 걸릴 때'만 찍혀, 로그인한 사람이
//   '계좌 안내받기'를 눌렀는지가 안 남았다 — 눌렀는데 실패한 것과 안 누른 것을 구별 못 했다.
describe("멤버십 퍼널 요약", () => {
  it("단계마다 앞 단계 대비 비율을 낸다", () => {
    const s = summarizeFunnel({ views: 100, ctaClicks: 20, orders: 5, paid: 4 });
    expect(s.stages.map((x) => x.key)).toEqual(["views", "ctaClicks", "orders", "paid"]);
    expect(s.stages[0].rateFromPrev).toBeNull();     // 첫 단계는 견줄 앞이 없다
    expect(s.stages[1].rateFromPrev).toBeCloseTo(0.2);
    expect(s.stages[2].rateFromPrev).toBeCloseTo(0.25);
    expect(s.stages[3].rateFromPrev).toBeCloseTo(0.8);
  });

  it("전환율은 도달 대비 입금 완료다 — 신청이 아니라 돈이 들어온 것", () => {
    expect(summarizeFunnel({ views: 100, ctaClicks: 20, orders: 5, paid: 4 }).conversion).toBeCloseTo(0.04);
  });

  it("가장 크게 빠지는 구간을 짚는다 — 어디를 고칠지가 답이다", () => {
    const s = summarizeFunnel({ views: 100, ctaClicks: 20, orders: 5, paid: 4 });
    expect(s.worstDrop).toEqual({ from: "views", to: "ctaClicks", lost: 80 });
  });

  it("지금 실측처럼 첫 관문에서 다 빠지면 그걸 짚는다", () => {
    const s = summarizeFunnel({ views: 13, ctaClicks: 0, orders: 0, paid: 0 });
    expect(s.worstDrop).toEqual({ from: "views", to: "ctaClicks", lost: 13 });
    expect(s.conversion).toBe(0);
  });

  it("아무 일도 없으면 짚을 구간도 없다 — 없는 진단을 지어내지 않는다", () => {
    const s = summarizeFunnel({ views: 0, ctaClicks: 0, orders: 0, paid: 0 });
    expect(s.conversion).toBeNull();
    expect(s.worstDrop).toBeNull();
  });

  it("뒤 단계가 앞 단계보다 크면 비율을 1로 자르지 않고 그대로 알린다", () => {
    // 계측이 빠진 경로로 들어온 주문이 있으면 이렇게 된다 — 감추면 계측 구멍을 못 본다.
    const s = summarizeFunnel({ views: 2, ctaClicks: 0, orders: 3, paid: 1 });
    expect(s.stages[2].rateFromPrev).toBeNull(); // 앞 단계가 0이면 비율을 낼 수 없다
    expect(s.stages[2].count).toBe(3);
  });
});
