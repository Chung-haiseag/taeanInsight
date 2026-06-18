// 주간 리포트 배치 파이프라인
// PRD v1.8 §6 REQ-PRODUCT-001 — 매주 목요일 22:00 시작, 금요일 06:00까지 완료, 09:00 발행
// REQ-AI-003 배치 처리, REQ-COST-001 서킷 브레이커 통합
//
// LLM 경로: Workers AI 무료 오픈모델(종량 0). 운영 Worker는 Claude API 미사용(CLAUDE.md 방침).
//   채널 "batch"는 "유휴시간 사전 생성" 의미로만 사용 — 라우터에 Workers AI 클라이언트를
//   batch·realtime 양쪽에 꽂으므로 실제 호출은 무료 모델(Anthropic Batch 아님).

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
    prompt: "참고 자료의 최근 태안 주요 소식(행정·지역경제·관광·환경·사건 등)을 종합해, 이번 주 태안에서 무슨 일이 있었는지 핵심을 짚어 요약하세요. 구체적 사건·이름·수치를 포함하세요.",
  },
  {
    key: "tourism_weather",
    title: "관광·기상 예측",
    prompt: "참고 자료의 기상 관측·환경 추세·축제/관광지 정보를 바탕으로, 다음 주말 안면도·만리포·천리포 등 태안 관광지의 날씨와 관광객 흐름을 전망하세요. 진행 중·예정 축제가 있으면 일정과 함께 안내하세요.",
  },
  {
    key: "environment",
    title: "환경 모니터링",
    prompt: "참고 자료의 환경 추세·실시간 관측·관련 기사를 종합해, 이번 주 태안 해역과 가로림만·신두리 일대의 대기질·해양 환경 상황을 구체적 수치와 함께 설명하세요.",
  },
  {
    key: "realestate",
    title: "부동산·지역경제 동향",
    prompt: "참고 자료의 부동산·개발·지역경제 관련 기사를 바탕으로 최근 태안군의 토지·아파트·개발 사업과 지역경제 흐름, 그 변화 요인을 정리하세요.",
  },
  {
    key: "events",
    title: "다음 주 이벤트",
    prompt: "참고 자료의 축제 일정과 행사 관련 기사를 바탕으로, 앞으로 태안군에서 열리는 축제·행사·전시·체험 프로그램을 일정(시작~종료일)과 장소와 함께 정리하세요.",
  },
];

const SYSTEM_PROMPT = `당신은 충남 태안 지역신문의 주간 인사이트 리포트를 쓰는 기자입니다.
다음을 지키세요:
1. [참고 자료]로 주어진 기사·관측값·축제 정보를 적극적으로 종합해 구체적이고 풍부하게 쓰세요. 수치·이름·날짜·장소를 본문에 녹여 독자에게 맥락과 전망을 제시하세요.
2. 자료에 있는 사실만 쓰되, 주어진 자료를 최대한 활용하세요. 자료가 일부만 있으면 그 부분을 충실히 다루고, "데이터가 부족합니다" 같은 면피성 문장을 반복하지 마세요. 해당 주제 자료가 정말 전혀 없을 때만 마지막에 한 번 짧게 언급하세요.
3. 개인정보·민감 주제는 다루지 마세요. 자료에 없는 수치를 지어내지 마세요.
4. 한국어 기사체로 자연스럽게 5~8 문장 분량으로 작성하세요.`;

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
   * 5개 섹션을 순차 생성. 각 LLM 호출은 batch 채널(유휴시간 사전생성) — 라우터가
   * Workers AI 무료 모델로 처리(REQ-AI-003 "유휴 시간대에 일괄 생성").
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
          maxTokens: 900,
          temperature: 0.35,
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
