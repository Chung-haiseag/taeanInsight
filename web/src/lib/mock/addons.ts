// 데모용 add-on 상태 — 백엔드 인증/결제 없이 홈 개인화·페이월을 체험.
// 3가지 상태를 localStorage로 전환: anonymous(비로그인) / preview(로그인·미구독) / entitled(구독)

import type { AddonProduct } from "../types";

export type DemoHomeState = "anonymous" | "preview" | "entitled";

const KEY = "taean-demo-home-state";

export const MOCK_ADDON: AddonProduct = {
  key: "owner_pro",
  name: "사장님 Pro",
  description: "내 가게·내 지역 기준 주말 수요 예측과 가격·재고 실행 제안을 매일 받습니다.",
  priceKrw: 9_900,
  benefits: [
    "이번 주말 방문 수요 예측 (요일별 수치 + 근거)",
    "가격·재고·인력 실행 제안 (예: 토요일 1박 +5천원)",
    "적조·기상·행사 우선 알림 (영업 영향까지)",
    "주변 상권 평균가·점유율 비교",
  ],
};

export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK === "true";
}

export function getDemoHomeState(): DemoHomeState {
  // 기본값은 anonymous — 첫 방문 시 에디토리얼 홈(히어로)을 보여주고,
  // 우하단 토글로 미구독(페이월)·구독 상태를 전환해볼 수 있다.
  if (typeof window === "undefined") return "anonymous";
  const v = window.localStorage.getItem(KEY);
  return v === "preview" || v === "entitled" ? v : "anonymous";
}

export function setDemoHomeState(state: DemoHomeState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, state);
}
