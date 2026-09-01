import { apiFetch } from "./client";

export interface ReportSummary {
  counts: {
    articles: number | null;
    ebook: number | null;
    kgNodes: number | null;
    kgEdges: number | null;
    users: number | null;
    regionalNews: number | null;
    facts: number | null;
    pendingApplications: number | null;
    pushSubs: number | null;
    citizenArticles: number | null;
    govNotices: number | null;
    weeklyReports: number | null;
    envDays: number | null;
    reporters: number | null;
  };
  freshness: { latestArticle: string | null; latestRegional: string | null; latestEnv: string | null; lastCollected: string | null };
  config: {
    taeanLogin: boolean;
    dataGoKr: boolean;
    naver: boolean;
    kakao: boolean;
    webSearch: boolean;
    opinet: boolean;
    push: boolean;
    adminToken: boolean;
    slack: boolean;
  };
  dataSources?: Array<{
    key: string;
    name: string;
    status: "live" | "progress" | "check" | "parked" | "rejected";
    granularity?: string;
    metric: string | null;
    note: string;
    cat?: string;   // 영역: 관광·바다·수산·농업·날씨·안전·지역경제
    type?: string;  // 유형: 예측·경보·시세·실측·달력·구조·검증·요인
  }>;
  generatedAt: string;
}

export const getReportSummary = () => apiFetch<ReportSummary>("/api/admin/report/summary");

// 멤버십 전환 퍼널 — 도달 → 신청 시도 → 신청 완료 → 입금 확인.
//   ⚠ '신청'은 이제 membership_orders다. 예전엔 아무도 안 쓰는 subscription_leads를 세어
//     주문이 들어와도 0으로 보였다(2026-09-01 점검).
export interface MembershipFunnel {
  views: number; ctaClicks: number; orders: number; paid: number; conversion: number | null;
  stages: { key: string; label: string; count: number; rateFromPrev: number | null }[];
  worstDrop: { from: string; to: string; lost: number } | null;
  ordersByTerm: { plan: string; n: number }[];
  ctaByPlan: { plan: string; n: number }[];
  viewsBySource: { src: string; n: number }[];
  viewsDaily: { day: string; n: number }[];
  ordersDaily: { day: string; n: number }[];
  failReasons: { reason: string; n: number }[];
}
export const getMembershipFunnel = () => apiFetch<MembershipFunnel>("/api/admin/report/membership-funnel");

// 예보 적중률(공개) — 우리 날씨 예보 vs 실제 관측. 예측 신뢰의 정직한 근거.
export interface ForecastAccuracy {
  count: number;
  rainHitRate: number | null;
  tempMae: number | null;
  tempWithin2Rate: number | null;
  recent: { date: string; predTmax: number | null; obsTemp: number | null; predPop: number | null; obsRain: boolean; rainHit: number | null }[];
}
export const getForecastAccuracy = () => apiFetch<ForecastAccuracy>("/api/reports/forecast-accuracy");

// 공개 기능 설정(관리자) — 조회는 관리자, 변경은 superadmin(백엔드 강제).
export const getAdminSettings = () => apiFetch<{ publicPeople: boolean; publicPersonBio: boolean }>("/api/admin/settings");
export const setAdminSettings = (patch: { publicPeople?: boolean; publicPersonBio?: boolean }) =>
  apiFetch<{ ok: boolean; publicPeople: boolean; publicPersonBio: boolean }>("/api/admin/settings", { method: "POST", body: JSON.stringify(patch) });
