// 멤버십 전환 퍼널 요약(순수) — 도달 → 신청 시도 → 신청 완료 → 입금 확인.
//
//   왜 다시 짰나(2026-09-01 실측): 보고서가 '신청'으로 `subscription_leads`를 세고 있었는데,
//     2026-08-25 실결제 전환 뒤 주문은 `membership_orders`로 들어간다. **아무도 안 쓰는 표**를
//     세고 있어서, 주문이 실제로 들어와도 관리자 화면엔 영원히 0으로 보였다.
//   ⚠ 마지막 단계는 '신청'이 아니라 **입금 확인**이다. 계좌이체라 신청만으로는 돈이 안 들어온다.

export interface FunnelCounts {
  /** 멤버십 화면 도달 (usage_events membership_view) */
  views: number;
  /** 신청 시도 — 버튼을 눌렀는가 (usage_events membership_cta) */
  ctaClicks: number;
  /** 신청 완료 — 주문이 만들어졌는가 (membership_orders) */
  orders: number;
  /** 입금 확인 — 관리자가 통장을 대조했는가 (membership_orders.status='paid') */
  paid: number;
}

export interface FunnelStage {
  key: keyof FunnelCounts;
  label: string;
  count: number;
  /** 앞 단계 대비 비율. 첫 단계이거나 앞이 0이면 null — 0으로 나눈 값을 지어내지 않는다. */
  rateFromPrev: number | null;
}

export interface FunnelSummary {
  stages: FunnelStage[];
  /** 도달 대비 **입금 확인**. 도달이 없으면 null. */
  conversion: number | null;
  /** 사람이 가장 많이 빠지는 구간 — 어디를 고칠지가 답이다. 빠진 사람이 없으면 null. */
  worstDrop: { from: keyof FunnelCounts; to: keyof FunnelCounts; lost: number } | null;
}

const ORDER: { key: keyof FunnelCounts; label: string }[] = [
  { key: "views", label: "화면 도달" },
  { key: "ctaClicks", label: "신청 시도" },
  { key: "orders", label: "신청 완료" },
  { key: "paid", label: "입금 확인" },
];

export function summarizeFunnel(c: FunnelCounts): FunnelSummary {
  const stages: FunnelStage[] = ORDER.map((s, i) => {
    const prev = i === 0 ? null : c[ORDER[i - 1].key];
    return {
      key: s.key, label: s.label, count: c[s.key],
      rateFromPrev: prev && prev > 0 ? c[s.key] / prev : null,
    };
  });
  let worstDrop: FunnelSummary["worstDrop"] = null;
  for (let i = 1; i < ORDER.length; i++) {
    const lost = c[ORDER[i - 1].key] - c[ORDER[i].key];
    if (lost > 0 && (!worstDrop || lost > worstDrop.lost)) {
      worstDrop = { from: ORDER[i - 1].key, to: ORDER[i].key, lost };
    }
  }
  return { stages, conversion: c.views > 0 ? c.paid / c.views : null, worstDrop };
}
