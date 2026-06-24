// 프론트엔드 지역 설정 — 다른 신문사 적용 시 이 파일만 교체.
// 대부분의 지역 데이터는 백엔드 region.ts/API에서 오고, 프론트엔드 고유값(정적 콘텐츠)만 여기 둔다.
// 백엔드 지역설정: backend/src/region.ts, 포팅 절차: docs/REGION_PORTING.md

export interface SeasonalFood {
  name: string;
  emoji: string;
  months: number[]; // 제철 월(1~12)
}

export interface FrontRegionConfig {
  name: string;                 // 지역명(표시용)
  eupMyeon: Array<{ code: string; label: string }>; // 읍·면(온보딩 — 코드는 backend region.ts와 일치)
  seasonalFoods: SeasonalFood[]; // 이달의 제철 먹거리
}

export const FRONT_REGION: FrontRegionConfig = {
  name: "태안",
  eupMyeon: [
    { code: "taean", label: "태안읍" },
    { code: "anmyeon", label: "안면읍" },
    { code: "gonam", label: "고남면" },
    { code: "geunheung", label: "근흥면" },
    { code: "nam", label: "남면" },
    { code: "sowon", label: "소원면" },
    { code: "wonbuk", label: "원북면" },
    { code: "iwon", label: "이원면" },
  ],
  seasonalFoods: [
    { name: "꽃게", emoji: "🦀", months: [4, 5, 6, 9, 10, 11] },
    { name: "바지락", emoji: "🐚", months: [3, 4, 5, 6] },
    { name: "주꾸미", emoji: "🐙", months: [3, 4, 5] },
    { name: "갑오징어", emoji: "🦑", months: [4, 5, 6] },
    { name: "대하", emoji: "🦐", months: [9, 10, 11] },
    { name: "천일염", emoji: "🧂", months: [5, 6, 7, 8] },
    { name: "6쪽마늘", emoji: "🧄", months: [6, 7] },
    { name: "키조개", emoji: "🥢", months: [12, 1, 2, 3, 4, 5] },
    { name: "굴", emoji: "🦪", months: [11, 12, 1, 2] },
    { name: "감태", emoji: "🌿", months: [12, 1, 2] },
    { name: "곱창김", emoji: "🍙", months: [12, 1, 2, 3] },
  ],
};
