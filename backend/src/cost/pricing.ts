// LLM 호출 비용 계산 — 토큰 수 + 모델별 단가로 KRW 환산
// PRD v1.8 §6 REQ-COST-001 — 월 30만원 한도 강제

// 단가 (USD per 1M tokens, 2026-05-27 기준 — 변동 시 갱신)
const PRICING = {
  // Anthropic Claude Haiku — Batch API는 50% 할인
  "anthropic:claude-haiku": { input: 0.25, output: 1.25 },
  "anthropic:claude-haiku-batch": { input: 0.125, output: 0.625 },
  "anthropic:claude-sonnet": { input: 3.0, output: 15.0 },
  "anthropic:claude-sonnet-batch": { input: 1.5, output: 7.5 },

  // Together AI Solar Mini
  "together:solar-mini": { input: 0.2, output: 0.2 },
  "together:llama-3.1-8b": { input: 0.18, output: 0.18 },
} as const;

// USD → KRW 환율 (월 단위 갱신, 안전값으로 1,400원 가정)
const USD_TO_KRW = 1400;

export type ModelKey = keyof typeof PRICING;

export function isKnownModel(model: string): model is ModelKey {
  return model in PRICING;
}

export function calculateLlmCostKrw(
  model: ModelKey,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model];
  const usd = ((inputTokens * p.input) + (outputTokens * p.output)) / 1_000_000;
  return Number((usd * USD_TO_KRW).toFixed(4));
}

// 외부 API 단가 (호출당 KRW)
const EXTERNAL_API_PRICING: Record<string, number> = {
  "tour_api": 0,                 // 무료
  "weather_api": 0,              // 무료
  "marine_api": 0,               // 무료
  "kosis": 0,                    // 무료
  "kakao_alimtalk": 12,          // 건당 12원
  "sms": 20,                     // LMS 기준
  "toss_payments": 0,            // 거래액의 % (별도 차감)
};

export function calculateExternalApiCostKrw(
  vendor: string,
  calls: number,
): number {
  const unit = EXTERNAL_API_PRICING[vendor] ?? 0;
  return Number((unit * calls).toFixed(4));
}
