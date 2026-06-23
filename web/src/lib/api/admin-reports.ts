// 관리자 주간 리포트 검수·발행 API 클라이언트.
import { apiFetch, ApiError } from "./client";

export interface AdminReportSection { key: string; title: string; content: string }
export interface AdminReport {
  weekId: string;
  status: "draft" | "in_review" | "published";
  aiLabel: "human" | "ai_assisted" | "ai_generated";
  publishedAt: string;
  summary: string;
  sections: AdminReportSection[];
}
export interface CurrentReportResp {
  report: AdminReport | null;
  governance: { approved: boolean; reasons: string[] } | null;
}

export function getCurrentReport(): Promise<CurrentReportResp> {
  return apiFetch<CurrentReportResp>("/api/admin/reports/current");
}

export function generateDraft(): Promise<{ ok: boolean; weekId: string; status: string }> {
  return apiFetch("/api/admin/reports/generate", { method: "POST", body: JSON.stringify({}) });
}

export async function publishReport(weekId: string, reviewerId: string): Promise<{ ok: boolean; error?: string; reasons?: string[] }> {
  try {
    return await apiFetch(`/api/admin/reports/${encodeURIComponent(weekId)}/publish`, {
      method: "POST",
      body: JSON.stringify({ reviewerId }),
    });
  } catch (e) {
    // 거버넌스 차단(422) 등은 본문에 error/reasons가 담겨 옴
    if (e instanceof ApiError && e.body && typeof e.body === "object") return e.body as { ok: boolean; error?: string; reasons?: string[] };
    throw e;
  }
}

export function unpublishReport(weekId: string): Promise<{ ok: boolean; reverted: boolean }> {
  return apiFetch(`/api/admin/reports/${encodeURIComponent(weekId)}/unpublish`, { method: "POST", body: JSON.stringify({}) });
}
