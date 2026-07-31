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
