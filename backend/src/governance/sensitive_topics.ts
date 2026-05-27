// 민감 주제 분류기 — PRD v1.8 §6 REQ-GOV-001 / Q6 (2026-05-27)
// 7종 카테고리: 선거·범죄·의료·종교 (기본) + 정치적 인물·부동산 투기 자문·소수자 이슈 (확장)

export type SensitiveTopic =
  | "election"
  | "crime"
  | "medical"
  | "religion"
  | "political_figure"
  | "realestate_speculation"
  | "minority_issues";

export interface TopicRule {
  topic: SensitiveTopic;
  keywords: string[];
  requiresHitl: boolean;
  blockAiOnly: boolean;
  description: string;
}

// DB의 sensitive_topic_rules 테이블 시드와 동기화 (003 마이그레이션)
export const DEFAULT_RULES: TopicRule[] = [
  {
    topic: "election",
    keywords: ["선거", "후보", "정당", "투표", "공천", "경선", "선거구"],
    requiresHitl: true,
    blockAiOnly: true,
    description: "AI 단독 발행 차단, 편집장 직접 작성",
  },
  {
    topic: "crime",
    keywords: ["살인", "강도", "폭행", "피의자", "피해자", "검찰", "경찰 조사", "구속"],
    requiresHitl: true,
    blockAiOnly: true,
    description: "사실 확인 2단계 강제, 익명 처리 의무",
  },
  {
    topic: "medical",
    keywords: ["진단", "처방", "치료", "수술", "약물", "임상", "복용"],
    requiresHitl: true,
    blockAiOnly: true,
    description: "의료 전문가 자문 필요",
  },
  {
    topic: "religion",
    keywords: ["교회", "사찰", "신앙", "교리", "종파", "이단", "포교"],
    requiresHitl: true,
    blockAiOnly: true,
    description: "AI 단독 발행 차단",
  },
  {
    topic: "political_figure",
    keywords: ["군수", "시장", "국회의원", "의원", "정치인", "도지사", "비례대표"],
    requiresHitl: true,
    blockAiOnly: false,
    description: "정치 편향 검토 필수",
  },
  {
    topic: "realestate_speculation",
    keywords: ["투자", "투기", "시세 차익", "단기 매매", "갭투자", "분양권"],
    requiresHitl: true,
    blockAiOnly: false,
    description: "면책 조항 자동 부착",
  },
  {
    topic: "minority_issues",
    keywords: ["장애", "이주민", "외국인", "성소수자", "다문화"],
    requiresHitl: true,
    blockAiOnly: false,
    description: "차별 표현 자동 스캔",
  },
];

export interface ClassificationResult {
  topics: Array<{ topic: SensitiveTopic; matchedKeywords: string[]; rule: TopicRule }>;
  requiresHitl: boolean;
  blockAiOnly: boolean;
}

export function classifySensitiveTopics(text: string, rules: TopicRule[] = DEFAULT_RULES): ClassificationResult {
  const hits: ClassificationResult["topics"] = [];
  const lower = text.toLowerCase();

  for (const rule of rules) {
    const matched = rule.keywords.filter((k) => lower.includes(k.toLowerCase()));
    if (matched.length > 0) {
      hits.push({ topic: rule.topic, matchedKeywords: matched, rule });
    }
  }

  return {
    topics: hits,
    requiresHitl: hits.some((h) => h.rule.requiresHitl),
    blockAiOnly: hits.some((h) => h.rule.blockAiOnly),
  };
}
