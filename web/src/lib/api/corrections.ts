// 전자북 기사 수정 요청 API 클라이언트 — backend/src/archive/corrections.ts 매핑

import { apiFetch } from "./client";

export type CorrectionStatus = "pending" | "accepted" | "rejected";

export interface MyCorrection {
  id: number;
  idxno: number;
  selectedText: string;
  suggestion: string;
  note?: string | null;
  status: CorrectionStatus;
  adminNote?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  title?: string | null;
}

export const CORRECTION_STATUS_LABELS: Record<CorrectionStatus, string> = {
  pending: "검토중",
  accepted: "반영됨",
  rejected: "반려",
};

export async function submitCorrection(input: {
  idxno: number;
  selectedText: string;
  suggestion: string;
  note?: string;
}): Promise<{ ok: boolean; id: number }> {
  return apiFetch("/api/archive/corrections", { method: "POST", body: JSON.stringify(input) });
}

export async function getMyCorrections(): Promise<{ items: MyCorrection[] }> {
  return apiFetch("/api/archive/corrections/mine");
}

// ── 관리자(apiFetch가 sessionStorage의 X-Admin-Token 자동 부착) ──

export interface AdminCorrection extends MyCorrection {
  uid: string;
  body?: string | null;       // 기사 현재 본문(편집기 초기값)
  publishedAt?: string | null;
}

export async function getAdminCorrections(
  status: CorrectionStatus | "all" = "pending",
): Promise<{ items: AdminCorrection[]; counts: Record<string, number> }> {
  return apiFetch(`/api/admin/corrections?status=${status}`);
}

export async function resolveCorrection(
  id: number,
  action: "accept" | "reject",
  adminNote?: string,
): Promise<{ ok: boolean; status: CorrectionStatus }> {
  return apiFetch(`/api/admin/corrections/${id}`, {
    method: "POST",
    body: JSON.stringify({ action, adminNote }),
  });
}
