// AI 거버넌스 통합 미들웨어
// 모든 발행 경로(주간 리포트·시민기자 기사·Query 응답)는 이 미들웨어를 거쳐야 함
// PRD v1.8 §6 REQ-GOV-001

import { detectPii, type PiiResult } from "./pii";
import { classifySensitiveTopics, type ClassificationResult } from "./sensitive_topics";
import { checkPublishGuard, type AiLabel, type PublishGuardInput, type PublishGuardResult } from "./ai_label";

export interface GovernanceInput {
  body: string;                       // 발행할 본문
  aiLabel: AiLabel;
  sources: PublishGuardInput["sources"];
  hitlReviewerId?: string;
}

export interface GovernanceResult {
  approved: boolean;
  body: string;                       // PII 마스킹된 본문
  reasons: string[];
  pii: PiiResult;
  sensitive: ClassificationResult;
  publishGuard: PublishGuardResult;
  forcedAiLabel: AiLabel;             // 자동 부착 라벨 (변경 불가)
}

/**
 * 4대 원칙 통합 체크:
 *  - PII 자동 탐지·마스킹
 *  - 민감 주제 분류 → AI 단독 발행 차단
 *  - 출처·HITL 가드
 *  - AI 라벨 강제 부착
 */
export function applyGovernance(input: GovernanceInput): GovernanceResult {
  const reasons: string[] = [];

  // 1) PII 마스킹
  const pii = detectPii(input.body);
  const maskedBody = pii.masked;
  if (pii.findings.length > 0) {
    reasons.push(`PII ${pii.findings.length}건 자동 마스킹: ${pii.findings.map((f) => f.kind).join(", ")}`);
  }

  // 2) 민감 주제 분류 (마스킹 전 본문 기준 — 분류 정확도 우선)
  const sensitive = classifySensitiveTopics(input.body);
  if (sensitive.topics.length > 0) {
    reasons.push(`민감 주제 ${sensitive.topics.length}건 감지: ${sensitive.topics.map((t) => t.topic).join(", ")}`);
  }

  // AI 단독 발행이 차단되는 카테고리에 걸렸으면 ai_generated → 거부
  if (sensitive.blockAiOnly && input.aiLabel === "ai_generated" && !input.hitlReviewerId) {
    reasons.push("민감 주제 — AI 단독 발행 차단 (HITL 검토자 필수)");
  }

  // HITL 필수 카테고리에 걸렸으면 검토자 없으면 거부
  if (sensitive.requiresHitl && !input.hitlReviewerId) {
    reasons.push("민감 주제 — HITL 검토자 필수");
  }

  // 3) 출처·HITL 발행 가드
  const publishGuard = checkPublishGuard({
    aiLabel: input.aiLabel,
    sources: input.sources,
    hitlReviewerId: input.hitlReviewerId,
  });
  if (!publishGuard.allowed && publishGuard.reason) {
    reasons.push(publishGuard.reason);
  }

  const approved =
    publishGuard.allowed &&
    !(sensitive.blockAiOnly && input.aiLabel === "ai_generated" && !input.hitlReviewerId) &&
    !(sensitive.requiresHitl && !input.hitlReviewerId);

  return {
    approved,
    body: maskedBody,
    reasons,
    pii,
    sensitive,
    publishGuard,
    forcedAiLabel: input.aiLabel,           // 메타데이터로 영구 기록 (제거 불가)
  };
}
