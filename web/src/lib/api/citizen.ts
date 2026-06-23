// 시민기자 운영 API 클라이언트 — backend/src/citizen/router.ts 매핑

import { apiFetch } from "./client";

export type SettlementStatus = "pending" | "processing" | "paid" | "failed";

export interface ReporterSummary {
  userId: string;
  name: string;
  cohort: string;
  eupMyeon: string;
  active: boolean;
  onboardingCompleted: boolean;
  publishedCount: number;
  trainingCompleted: number; // 0~6
  settlement?: {
    month: string;
    articleCount: number;
    baseFeeKrw: number;
    bonusKrw: number;
    totalKrw: number;
    status: SettlementStatus;
  };
}

export interface CitizenSummary {
  totalReporters: number;
  active: number;
  publishedTotal: number;
  settlementMonth: string;
  settlementTotalKrw: number;
  pendingSettlements: number;
}

export async function getReporters(): Promise<{ reporters: ReporterSummary[]; summary: CitizenSummary }> {
  return apiFetch<{ reporters: ReporterSummary[]; summary: CitizenSummary }>("/api/admin/citizen/reporters");
}

export async function paySettlement(reporterId: string): Promise<{ ok: boolean; reporter: ReporterSummary }> {
  return apiFetch(`/api/admin/citizen/settlements/${reporterId}/pay`, { method: "POST" });
}

// 제출된 시민기자 기사 검수(D1)
export interface CitizenSubmission {
  id: string; title: string; aiLabel: string; status: string; submittedAt: string | null; reporter: string; excerpt: string;
}
export async function getCitizenSubmissions(): Promise<CitizenSubmission[]> {
  return apiFetch<{ items: CitizenSubmission[] }>("/api/admin/citizen/submissions").then((d) => d.items);
}
export async function decideCitizenSubmission(id: string, decision: "approved" | "rejected", notes?: string): Promise<{ ok: boolean; status: string }> {
  return apiFetch(`/api/admin/citizen/submissions/${id}/decision`, { method: "POST", body: JSON.stringify({ decision, notes }) });
}

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  pending: "이체 대기",
  processing: "이체 중",
  paid: "이체 완료",
  failed: "실패",
};
