// HITL 검수 큐 API 클라이언트 — backend/src/governance/review_router.ts 매핑

import { apiFetch } from "./client";

export type ReviewStatus = "pending" | "approved" | "rejected";
export type AiLabel = "human" | "ai_assisted" | "ai_generated";

export interface ReviewItem {
  id: string;
  resourceType: "report" | "qa" | "article" | "dashboard";
  resourceId: string;
  title: string;
  excerpt: string;
  aiLabel: AiLabel;
  sensitiveTopics: string[];
  piiKinds: string[];
  requiresHitl: boolean;
  blockAiOnly: boolean;
  reasons: string[];
  status: ReviewStatus;
  queuedAt: string;
  reviewerId?: string;
  reviewedAt?: string;
  decisionReason?: string;
}

export interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
}

export async function getReviewQueue(
  status?: ReviewStatus,
): Promise<{ items: ReviewItem[]; stats: ReviewStats }> {
  const q = status ? `?status=${status}` : "";
  return apiFetch<{ items: ReviewItem[]; stats: ReviewStats }>(`/api/admin/review${q}`);
}

export async function decideReview(
  id: string,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<{ ok: boolean; item: ReviewItem }> {
  return apiFetch(`/api/admin/review/${id}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, reason }),
  });
}

// 민감 주제·PII 한글 라벨
export const SENSITIVE_TOPIC_LABELS: Record<string, string> = {
  election: "선거",
  crime: "범죄",
  medical: "의료",
  religion: "종교",
  political_figure: "정치인",
  realestate_speculation: "부동산 투기",
  minority_issues: "소수자 이슈",
};

export const PII_KIND_LABELS: Record<string, string> = {
  rrn: "주민번호",
  phone: "전화",
  email: "이메일",
  card: "카드",
  address: "주소",
  passport: "여권",
};
