# taean-insight-backend

태안 AI 인텔리전스 백엔드 API — Cloudflare Workers + Hono + TypeScript.

## 구조

```
backend/
├── package.json
├── tsconfig.json
├── wrangler.jsonc          # Worker 설정 + cron (매시간 비용 집계)
├── vitest.config.ts
├── src/
│   ├── index.ts            # Hono 앱 + Scheduled 핸들러
│   ├── types.ts            # 공통 타입
│   └── cost/               # #19 비용 모니터링 & 서킷 브레이커
│       ├── pricing.ts        # 모델별 KRW 단가 계산
│       ├── recorder.ts       # cost_events 기록
│       ├── circuit_breaker.ts# 호출 차단 결정
│       ├── aggregator.ts     # 월 누적 + 임계값 알림 (Slack/콘솔)
│       ├── scheduled.ts      # cron 핸들러
│       └── router.ts         # /api/cost/* HTTP 라우트
└── tests/
    └── cost.test.ts        # 단위 테스트
```

## 비용 모니터링 — #19 산출물

PRD v1.8 §6 REQ-COST-001 강제 메커니즘.

### 핵심 동작
1. 모든 LLM·외부 API 호출 직후 `recorder` 가 `cost_events` 적재
2. 매시간 `aggregator` 가 이번 달 누적 합산 + 70/90/100% 임계 체크
3. 새로 통과한 임계값에 대해 Slack/콘솔 알림 한 번 발송 (중복 방지)
4. `circuit_breaker` 가 호출 직전 차단 결정:
   - 0~100%: 모두 허용
   - 100~110%: critical 만 (예: 적조 Web Push)
   - 110%+: 모두 차단 (수동 개입)

### 단가 정책 (`pricing.ts`)
- Anthropic Claude Haiku Batch: 일반의 50% 할인
- Together AI Solar Mini: $0.20/1M tokens
- 카카오 알림톡: 건당 12원
- 공공 API (관광·기상·해수부·KOSIS): 무료

### HTTP API
| Method | Path | 용도 |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/api/cost/summary` | 이번 달 누적·임계값 현황 |
| POST | `/api/cost/check-circuit` | `{priority}` 입력 → 호출 차단 여부 |
| POST | `/api/cost/record` | 비용 이벤트 수동 기록 (테스트/외부 시스템용) |
| GET | `/api/cost/month` | 현재 월 |

### 영구 저장소

지금은 **인메모리** 구현체로 동작 (PoC). 향후 다음 중 하나로 교체 예정:
- Cloudflare D1 (`d1_databases` 바인딩)
- 외부 Postgres + Cloudflare Hyperdrive
- KV (단순 집계만 필요한 경우)

교체 시 `CostStore`·`MonthlyCostQuery`·`AggregatorStore` 인터페이스 구현체만 추가하면 됩니다.

## 로컬 개발

```bash
cd backend
npm install
npm run dev          # http://localhost:8787

# 테스트
npm test

# 타입 체크
npm run typecheck
```

## 배포

```bash
# 시크릿 등록 (한 번만)
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TOGETHER_API_KEY
npx wrangler secret put SLACK_WEBHOOK_URL    # 임계값 알림용 (없으면 콘솔로 발송)

npm run deploy
```

배포 후 Custom domain `api.insight.taeannews.co.kr` 연결 예정 (TaskMaster #8 일환).

## 다음 작업 매핑

| 후속 태스크 | 통합 지점 |
|---|---|
| #1 Hybrid LLM Client | 모든 LLM 호출 후 `recorder.recordLlm()` 자동 호출 |
| #15 LangGraph Router | Router 미들웨어에서 `circuit_breaker.check()` 가드 |
| #21 OAuth2 SSO | 인증 미들웨어 + 사용량 한도 (`segment_limits` 연동) |
| #22 주간 리포트 | 배치 발송 전 critical 우선순위로 차단 체크 |
