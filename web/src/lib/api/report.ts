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
  };
  freshness: { latestArticle: string | null; latestRegional: string | null };
  generatedAt: string;
}

export const getReportSummary = () => apiFetch<ReportSummary>("/api/admin/report/summary");
