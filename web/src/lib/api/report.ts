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
  freshness: { latestArticle: string | null; latestRegional: string | null; latestEnv: string | null };
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
  generatedAt: string;
}

export const getReportSummary = () => apiFetch<ReportSummary>("/api/admin/report/summary");

// 멤버십 사전신청 전환 퍼널(방문→CTA→신청). 유료전환/유지(paid)는 결제 연동 후.
export interface MembershipFunnel {
  views: number; ctaClicks: number; leads: number; conversion: number | null;
  leadsByPlan: { plan: string; n: number }[];
  ctaByPlan: { plan: string; n: number }[];
  viewsBySource: { src: string; n: number }[];
  viewsDaily: { day: string; n: number }[];
  leadsDaily: { day: string; n: number }[];
  paid: null;
}
export const getMembershipFunnel = () => apiFetch<MembershipFunnel>("/api/admin/report/membership-funnel");

// 공개 기능 설정(관리자) — 조회는 관리자, 변경은 superadmin(백엔드 강제).
export const getAdminSettings = () => apiFetch<{ publicPeople: boolean }>("/api/admin/settings");
export const setAdminSettings = (patch: { publicPeople: boolean }) =>
  apiFetch<{ ok: boolean; publicPeople: boolean }>("/api/admin/settings", { method: "POST", body: JSON.stringify(patch) });
