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
const SECTION_PLAN: Array<{ key: ReportSectionKey; title: string; prompt: string; maxTokens?: number }> = [
  {
    key: "summary",
    title: "이번 주 한눈에 보기",
    prompt: "아래 제목들을 보고 이번 주 태안을 2~3개 주제(예: 행정·선거 / 지역경제 / 사회·문화)로 묶어 3~4문장으로만 요약하세요. 절대 '첫째·둘째'처럼 항목을 나열하지 말고, 개별 행사·공연·축제는 언급하지 마세요(그건 다른 섹션 담당). 큰 흐름만 압축하세요.",
    maxTokens: 380,
  },
  {
    key: "tourism_weather",
    title: "관광·기상 예측",
    prompt: "기상 관측·환경 추세·관광지·축제 자료로 다음 주말 안면도·만리포·천리포 등 태안 관광지의 날씨와 관광객 흐름을 전망하세요. 일반 행정·문화 행사는 빼고 관광·기상에 집중하세요. 관광지 이름과 기온·하늘 상태를 포함하세요.",
  },
  {
    key: "environment",
    title: "환경 모니터링",
    prompt: "오직 대기질·해양환경 자료만 사용해 이번 주 태안 해역·가로림만·신두리의 환경 상황을 수치와 함께 설명하세요. PM10·PM2.5의 일자별 변화에서 평소 대비 두드러진 값이 있으면 사실대로 짚되 원인은 단정하지 마세요. 치안·사고·정치 등 사회 사건은 절대 포함하지 마세요.",
  },
  {
    key: "realestate",
    title: "부동산·지역경제 동향",
    prompt: "실거래가 자료(아파트·토지)와 지역경제 소식으로 동향을 정리하세요. 최저~최고만 나열하지 말고, 최고가 거래·대표 거래·평균 가격대를 비교해 인사이트를 주세요. 토지는 총 거래가 기준임을 밝히고, 진행 중 사업과 종료된 사업의 시점을 구분하세요.",
  },
  {
    key: "events",
    title: "다음 주 이벤트",
    prompt: "주간행사계획·축제 일정 자료로 앞으로 열리는 행사를 '날짜·장소·신청기간' 중심의 간결한 타임라인으로 정리하세요. 자료에 일정이 명시된 것만 쓰고, 각 항목은 한두 문장으로 압축하세요.",
  },
];

const SYSTEM_PROMPT = `당신은 충남 태안 지역신문의 주간 인사이트 리포트를 쓰는 기자입니다. 아래 규칙을 반드시 지키세요.

[사실성 — 환각 금지]
1. [참고 자료]에 실제로 있는 사실만 쓰세요. 자료에 없는 사건·인물·수치·관람객수·통계를 절대 지어내지 마세요. 불확실하면 쓰지 마세요.
2. 각 섹션의 주제 범위를 벗어나지 마세요. 특히 환경 섹션은 대기질·해양환경만 다루고, 치안·사고·밀입국·정치 같은 사회 사건을 환경 문제로 엮지 마세요.

[중복 금지]
3. 같은 행사·소식을 여러 섹션에 반복하지 마세요. 행사·축제·공연의 구체적 나열은 '다음 주 이벤트' 섹션에서만 합니다. '이번 주 한눈에 보기'는 개별 행사를 나열하지 말고 큰 흐름만 요약하세요.

[정량화]
4. 수치는 자료의 실제 값으로 제시하고, 가능하면 비교(최고·평균·증감)로 인사이트를 주세요. 평소 대비 두드러진 값은 사실대로 짚되 원인을 임의로 단정하지 마세요.
5. 진행 중인 사업과 이미 끝난 사업의 시점을 구분해 기술하세요.

[형식]
6. 개인정보·민감정보는 제외. 한국어 기사체로 4~7문장.`;

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
          maxTokens: plan.maxTokens ?? 900,
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
