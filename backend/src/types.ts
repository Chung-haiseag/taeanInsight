// 공통 타입 정의

export interface Env {
  // 환경변수
  MONTHLY_COST_LIMIT_KRW: string;       // "300000"
  ALERT_THRESHOLDS: string;             // "0.7,0.9,1.0"
  ENVIRONMENT: "development" | "staging" | "production";

  // 시크릿 (Wrangler secret으로 설정)
  ANTHROPIC_API_KEY?: string;
  TOGETHER_API_KEY?: string;
  SLACK_WEBHOOK_URL?: string;

  // 태안신문 아카이브 바인딩
  ARCHIVE_DB?: D1Database;        // 기사 텍스트·검색
  ARCHIVE_PHOTOS?: R2Bucket;      // 사진 파일

  // 향후 추가
  // CACHE: KVNamespace;
  // BATCH_QUEUE: Queue;
}

// 비용 이벤트
export type CostCategory =
  | "llm_inference"
  | "external_api"
  | "storage"
  | "pg_fee"
  | "sms_kakao"
  | "other";

export interface CostEvent {
  id?: string;                          // DB가 채움
  eventAt?: string;                     // ISO 8601, 미지정 시 현재 시각
  category: CostCategory;
  vendor: string;                       // "anthropic" | "together_ai" | "tour_api" | ...
  amountKrw: number;                    // 원 (소수점 4자리까지)
  quantity?: number;                    // 토큰 수·호출 횟수
  unit?: "tokens" | "calls" | "gb_hours" | "messages";
  metadata?: Record<string, unknown>;
}

// 월 누적 비용 보고서
export interface MonthlyCostReport {
  month: string;                        // "2026-08"
  totalKrw: number;
  limitKrw: number;
  ratio: number;                        // totalKrw / limitKrw
  byCategory: Record<CostCategory, number>;
  byVendor: Record<string, number>;
  thresholdsCrossed: number[];          // [0.7, 0.9] 등 이번 달 이미 초과된 임계값
}
