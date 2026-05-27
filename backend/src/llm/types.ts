// Hybrid LLM Client 공통 타입
// PRD v1.8 §6 REQ-AI-001·REQ-INFRA-001
// - 배치(비동기): Anthropic Claude Batch API (50% 할인)
// - 실시간(동기): Together AI Solar Mini

export type LlmChannel = "batch" | "realtime";

export type LlmIntent =
  | "prediction"        // 예측 (관광·환경·부동산)
  | "generation"        // 요약·다듬기·제목
  | "factcheck"         // 사실 확인
  | "other";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  channel?: LlmChannel;            // 미지정 시 라우터가 결정
  intent?: LlmIntent;              // 미지정 시 분류기가 추정
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

export interface LlmResponse {
  content: string;
  channel: LlmChannel;
  model: string;                   // 'anthropic:claude-haiku' 'together:solar-mini'
  inputTokens: number;
  outputTokens: number;
  costKrw: number;                 // 응답 후 자동 기록됨
  fromCache: boolean;
  latencyMs: number;
  metadata?: Record<string, unknown>;
}

// 클라이언트 추상화 — 벤더별 구현체가 이 인터페이스를 만족
export interface LlmClient {
  readonly vendor: string;
  readonly model: string;
  readonly channel: LlmChannel;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

// 에러 클래스 — 호출 차단·벤더 에러·타임아웃 등을 구분
export class CircuitOpenError extends Error {
  constructor(message: string, public readonly monthlyTotalKrw: number, public readonly limitKrw: number) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

export class VendorError extends Error {
  constructor(public readonly vendor: string, public readonly status: number, message: string) {
    super(message);
    this.name = "VendorError";
  }
}
