// 주간 인사이트 리포트 타입 정의
// PRD v1.8 §6 REQ-PRODUCT-001

import type { AiLabel } from "../governance/ai_label";
import type { SourceCitation } from "../agents/types";

// ISO 주차 표기 "2026-W22"
export type WeekId = string;

export type ReportSectionKey =
  | "summary"
  | "tourism_weather"
  | "environment"
  | "realestate"
  | "events";

export interface ReportSection {
  key: ReportSectionKey;
  title: string;
  content: string;
  sources: SourceCitation[];
  charts?: Array<{ kind: string; data: unknown }>;
}

export interface WeeklyReport {
  weekId: WeekId;
  publishedAt: string;            // ISO 8601
  summary: string;
  sections: ReportSection[];
  aiLabel: AiLabel;
  hitlReviewerId?: string;
  pdfUrl?: string;
  premiumOnly: boolean;
  // 초개인화 페이지에서 사용할 콘텐츠 가시성 등급 (v1.8)
  visibilityTier: "critical" | "community" | "personal";
}

// ISO 주차 계산 (YYYY-Www)
export function getIsoWeekId(d: Date = new Date()): WeekId {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
