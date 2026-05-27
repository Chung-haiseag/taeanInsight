// 주간 리포트 배치 파이프라인
// PRD v1.8 §6 REQ-PRODUCT-001 — 매주 목요일 22:00 시작, 금요일 06:00까지 완료, 09:00 발행
// REQ-AI-003 배치 처리, REQ-COST-001 서킷 브레이커 통합

import type { HybridLlmRouter } from "../llm/hybrid_router";
import type { ReportSection, ReportSectionKey, WeeklyReport } from "./types";
import { getIsoWeekId } from "./types";
import { buildMessages } from "../agents/types";
import { applyGovernance } from "../governance/middleware";
import type { AiLabel } from "../governance/ai_label";

// 섹션 정의 — 5개 표준 섹션
const SECTION_PLAN: Array<{ key: ReportSectionKey; title: string; prompt: string }> = [
  {
    key: "summary",
    title: "이번 주 한눈에 보기",
    prompt: "이번 주 태안 관광·환경·부동산·이벤트 핵심을 3~4 문장으로 요약하세요. 출처가 명확한 사실만 기재.",
  },
  {
    key: "tourism_weather",
    title: "관광·기상 예측",
    prompt: "다음 주말 안면도·만리포·천리포 일대의 기상·관광객 흐름을 예측하고 그 근거를 짧게 설명하세요.",
  },
  {
    key: "environment",
    title: "환경 모니터링",
    prompt: "이번 주 가로림만·신두리·태안 해역의 환경 상황(적조·미세먼지·해양 쓰레기)을 요약하세요.",
  },
  {
    key: "realestate",
    title: "부동산 시세 동향",
    prompt: "최근 태안군 토지·아파트 거래 동향과 변화 요인을 간결히 요약하세요.",
  },
  {
    key: "events",
    title: "다음 주 이벤트",
    prompt: "다음 주 태안군에서 열리는 주요 행사·축제·전시·체험 프로그램을 시간 순으로 나열하세요.",
  },
];

const SYSTEM_PROMPT = `당신은 충남 태안 지역신문의 주간 인사이트 리포트 작성 보조입니다.
다음을 지키세요:
1. 출처가 불확실한 사실은 적지 말고 "관련 데이터가 부족합니다"라고 명시하세요.
2. 모든 수치는 가능하면 출처(태안군청·한국관광공사·기상청 등)와 함께 제시하세요.
3. 개인정보·민감 주제는 다루지 마세요.
4. 한국어 자연체로 4~6 문장 분량으로 작성하세요.`;

export interface WeeklyPipelineDeps {
  llm: HybridLlmRouter;
  /** 사실 자료 — 외부 API에서 미리 수집한 컨텍스트 */
  factsLoader?: (weekId: string, sectionKey: ReportSectionKey) => Promise<string>;
  /** HITL 검토자 ID — 발행 전에 반드시 채워져야 함 */
  hitlReviewerId?: string;
  /** AI 라벨 — 기본 ai_assisted */
  aiLabel?: AiLabel;
}

export class WeeklyReportPipeline {
  constructor(private deps: WeeklyPipelineDeps) {}

  /**
   * 한 주의 리포트 본문을 배치 생성.
   * 5개 섹션을 순차 생성하지만 각 LLM 호출은 batch 채널(Anthropic 50% 할인) 사용.
   * REQ-AI-003 "유휴 시간대에 일괄 생성" 기조.
   */
  async generate(weekId: string = getIsoWeekId(), now: Date = new Date()): Promise<WeeklyReport> {
    const sections: ReportSection[] = [];
    for (const plan of SECTION_PLAN) {
      const facts = await this.deps.factsLoader?.(weekId, plan.key);
      const userContent = facts ? `${plan.prompt}\n\n[참고 자료]\n${facts}` : plan.prompt;

      const response = await this.deps.llm.route(
        {
          intent: "prediction",
          channel: "batch",
          messages: buildMessages(SYSTEM_PROMPT, userContent),
          maxTokens: 600,
          temperature: 0.2,
        },
        "best_effort",
      );

      sections.push({
        key: plan.key,
        title: plan.title,
        content: response.content,
        sources: [],     // facts에서 추출한 출처는 별도 채울 수 있음
      });
    }

    const summary = sections.find((s) => s.key === "summary")?.content ?? "";

    return {
      weekId,
      publishedAt: now.toISOString(),
      summary,
      sections,
      aiLabel: this.deps.aiLabel ?? "ai_assisted",
      hitlReviewerId: this.deps.hitlReviewerId,
      premiumOnly: true,         // 기본은 Premium 전용 (Basic은 미리보기만)
      visibilityTier: "community",  // 주간 리포트는 보통 community 등급
    };
  }

  /**
   * 발행 전 거버넌스 게이트 — REQ-GOV-001
   * 통과해야만 publishedAt 확정 + 알림 발송 가능.
   */
  async validateForPublish(report: WeeklyReport): Promise<{
    approved: boolean;
    reasons: string[];
    sanitized: WeeklyReport;
  }> {
    const reasons: string[] = [];
    const sanitizedSections: ReportSection[] = [];

    for (const section of report.sections) {
      const result = applyGovernance({
        body: section.content,
        aiLabel: report.aiLabel,
        sources: section.sources.length > 0
          ? section.sources
          : [{ title: "태안신문 데이터 수집", publisher: "taeannews.co.kr" }],
        hitlReviewerId: report.hitlReviewerId,
      });
      if (!result.approved) {
        reasons.push(`섹션 "${section.title}": ${result.reasons.join(", ")}`);
      }
      sanitizedSections.push({ ...section, content: result.body });
    }

    return {
      approved: reasons.length === 0,
      reasons,
      sanitized: { ...report, sections: sanitizedSections },
    };
  }
}
