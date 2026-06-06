// 데모용 add-on 상태 — 백엔드 인증/결제 없이 홈 개인화·페이월을 체험.
// 3가지 상태를 localStorage로 전환: anonymous(비로그인) / preview(로그인·미구독) / entitled(구독)

import type { AddonProduct } from "../types";

export type DemoHomeState = "anonymous" | "preview" | "entitled";

const KEY = "taean-demo-home-state";

export const MOCK_ADDON: AddonProduct = {
  key: "hyper_personalization",
  name: "초개인화 홈",
  description: "로그인하면 첫 화면이 내 관심 지역·관심사 기반으로 재구성됩니다.",
  priceKrw: 4_900,
  benefits: [
    "관심 지역의 오늘·이번 주 예측을 홈 최상단에",
    "관심사 기반 맞춤 리포트 요약 자동 배치",
    "즐겨찾기·알림 바로가기 위젯",
    "초개인화 우선순위 정렬(critical/community/personal)",
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
