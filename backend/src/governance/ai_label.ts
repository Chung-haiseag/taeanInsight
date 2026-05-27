// AI 라벨 + 출처 검증 가드
// PRD v1.8 §6 REQ-GOV-001 4대 원칙 #1·#2

export type AiLabel = "human" | "ai_assisted" | "ai_generated";

export interface SourceCitation {
  title: string;
  url?: string;
  publishedAt?: string;          // ISO 8601
  publisher?: string;
}

export interface PublishGuardInput {
  aiLabel: AiLabel;
  sources: SourceCitation[];
  hitlReviewerId?: string;       // HITL 검토자 ID (있으면 검토 완료)
}

export interface PublishGuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * 발행 직전 가드 — 다음을 강제:
 * 1. AI 보조·생성 콘텐츠는 출처가 반드시 있어야 함
 * 2. AI 단독 발행은 HITL 검토자 있어야 통과
 */
export function checkPublishGuard(input: PublishGuardInput): PublishGuardResult {
  // 출처 의무 — AI 보조/생성 콘텐츠는 최소 1개의 출처 필요
  if (input.aiLabel !== "human" && input.sources.length === 0) {
    return { allowed: false, reason: "AI 콘텐츠는 출처가 최소 1개 필요합니다 (REQ-GOV-001)" };
  }

  // HITL 의무 — AI 단독 발행은 검토 필수
  if (input.aiLabel === "ai_generated" && !input.hitlReviewerId) {
    return { allowed: false, reason: "AI 단독 발행은 HITL 검토자가 필요합니다 (REQ-GOV-001)" };
  }

  // 출처 유효성 — URL 또는 발행일 중 하나는 있어야 검증 가능
  for (const src of input.sources) {
    if (!src.url && !src.publishedAt && !src.publisher) {
      return { allowed: false, reason: `출처 "${src.title}"에 URL·발행일·발행자 중 하나는 필요합니다` };
    }
  }

  return { allowed: true };
}

export const AI_LABEL_TEXT: Record<AiLabel, string> = {
  human: "사람 작성",
  ai_assisted: "AI 보조",
  ai_generated: "AI 생성",
};

/** AI 라벨이 자동으로 부착된 표시 텍스트를 생성 (제거 불가능한 형태) */
export function formatLabelBadge(label: AiLabel, reviewerInitials?: string): string {
  const text = AI_LABEL_TEXT[label];
  if (label === "human") return `[${text}]`;
  return reviewerInitials ? `[${text} · 검토 ${reviewerInitials}]` : `[${text}]`;
}
