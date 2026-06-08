// 시민 코파일럿 API 클라이언트 — backend/src/copilot/router.ts 매핑

import { apiFetch } from "./client";

export type AiLabel = "human" | "ai_assisted" | "ai_generated";

export interface CheckResult {
  chars: number;
  pii: { count: number; kinds: string[]; maskedPreview: string | null };
  sensitive: {
    topics: { topic: string; matched: string[] }[];
    requiresHitl: boolean;
    blockAiOnly: boolean;
  };
  warnings: string[];
}

export interface SubmitResult {
  ok: boolean;
  queued: boolean;
  reviewId: string;
  aiLabel: AiLabel;
  aiLabelText: string;
  publishAllowed: boolean;
  reasons: string[];
  message: string;
}

export async function copilotCheck(title: string, text: string): Promise<CheckResult> {
  return apiFetch("/api/copilot/check", { method: "POST", body: JSON.stringify({ title, text }) });
}

export async function copilotSubmit(input: {
  title: string;
  body: string;
  aiLabel: AiLabel;
  sources?: { title: string; url?: string }[];
  reporterId?: string;
}): Promise<SubmitResult> {
  return apiFetch("/api/copilot/submit", { method: "POST", body: JSON.stringify(input) });
}

export const SENSITIVE_LABELS: Record<string, string> = {
  election: "선거",
  crime: "범죄",
  medical: "의료",
  religion: "종교",
  political_figure: "정치인",
  realestate_speculation: "부동산 투기",
  minority_issues: "소수자 이슈",
};

export const PII_LABELS: Record<string, string> = {
  rrn: "주민번호",
  phone: "전화",
  email: "이메일",
  card: "카드",
  address: "주소",
  passport: "여권",
};
