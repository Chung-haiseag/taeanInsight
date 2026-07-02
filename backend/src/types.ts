// 공통 타입 정의

// Cloudflare Rate Limiting 바인딩(설치 타입에 없을 수 있어 명시)
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  // 환경변수
  MONTHLY_COST_LIMIT_KRW: string;       // "300000"
  ALERT_THRESHOLDS: string;             // "0.7,0.9,1.0"
  ENVIRONMENT: "development" | "staging" | "production";

  // 시크릿 (Wrangler secret으로 설정)
  ANTHROPIC_API_KEY?: string;
  TOGETHER_API_KEY?: string;
  SLACK_WEBHOOK_URL?: string;
  TAEAN_ID?: string;              // 태안신문 회원 로그인 ID (전문 수집용)
  TAEAN_PW?: string;              // 태안신문 회원 로그인 PW
  DATA_GO_KR_KEY?: string;        // 공공데이터포털 인증키 (날씨·대기질)
  TAEAN_NX?: string;              // 기상청 격자 X (기본 51)
  TAEAN_NY?: string;              // 기상청 격자 Y (기본 109)
  TAEAN_AIR_STATION?: string;     // 에어코리아 측정소명 (기본 태안읍)
  TAEAN_LAWD_CD?: string;         // 국토부 실거래가 법정동 시군구코드 (기본 44825 태안군)
  VAPID_PUBLIC_KEY?: string;      // Web Push VAPID 공개키(base64url 65바이트)
  VAPID_PRIVATE_KEY?: string;     // Web Push VAPID 개인키(시크릿, base64url d)
  VAPID_SUBJECT?: string;         // VAPID sub ("mailto:..." 기본)
  JWT_SECRET?: string;            // /api/me 인증 서명키
  GOV_IMPORT_TOKEN?: string;      // 군청 로컬 크롤러 → /api/gov/import 공유 토큰
  ADMIN_TOKEN?: string;           // 관리자 화면(/admin) 발행·검수·거버넌스 보호 토큰
  GOOGLE_TTS_KEY?: string;        // Google Cloud Text-to-Speech API 키(오디오 뉴스)
  GEMINI_API_KEY?: string;        // Gemini API 키(팟캐스트 멀티스피커 TTS, NotebookLM급)
  KAKAO_REST_KEY?: string;        // 카카오 로그인 REST API 키(OAuth)
  OPINET_KEY?: string;            // 오피넷 유가정보 certkey (충남 주유 평균가)
  NAVER_CLIENT_ID?: string;       // 네이버 데이터랩 검색어트렌드
  NAVER_CLIENT_SECRET?: string;
  ITS_API_KEY?: string;           // 국가교통정보센터(ITS) 실시간 CCTV

  // 태안신문 아카이브 바인딩
  ARCHIVE_DB?: D1Database;        // 기사 텍스트·검색
  ARCHIVE_PHOTOS?: R2Bucket;      // 사진 파일
  AI?: Ai;                        // Workers AI (저가 오픈모델)
  VECTORIZE?: VectorizeIndex;     // 기사 임베딩 인덱스(독자 맥락 추천)
  LOGIN_RL?: RateLimit;           // 로그인 무차별 대입 방어
  AUDIO_RL?: RateLimit;           // 오디오 온디맨드 생성 남용 방어

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
