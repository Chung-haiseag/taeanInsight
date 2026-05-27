# 데이터베이스 마이그레이션

태안 AI 인텔리전스 커먼즈 플랫폼 Postgres 스키마 (PRD v1.5 §8.3).

## 마이그레이션 순서

```
001_init_users_and_subscriptions.sql
002_citizen_reporters.sql
003_ai_content_logs_and_cost_events.sql
004_personalization_and_b2g.sql              # PRD v1.7 신규
005_content_visibility_tier.sql               # PRD v1.8 신규 (Critical/Community/Personal)
```

향후 추가 예정:
- `006_documents_and_embeddings.sql` (PGVector RAG — REQ-DATA-001)
- `007_weekly_reports.sql` (주간 인사이트 — REQ-PRODUCT-001, visibility_tier 컬럼 포함)
- `008_dashboards_and_b2b.sql` (B2B 대시보드 데이터 — REQ-PRODUCT-003)

## 적용 방법

### 수동 적용
```bash
psql -h localhost -U taean -d taean_insight -f db/migrations/001_init_users_and_subscriptions.sql
psql -h localhost -U taean -d taean_insight -f db/migrations/002_citizen_reporters.sql
psql -h localhost -U taean -d taean_insight -f db/migrations/003_ai_content_logs_and_cost_events.sql
```

### 자동 (향후 Alembic 또는 Flyway 도입 예정)
백엔드 프레임워크 결정 후 (FastAPI → Alembic / NestJS → TypeORM) 마이그레이션 도구 통합.

## 요구 사항

- PostgreSQL 15+
- `pgcrypto` 확장 (`gen_random_uuid()` 사용)
- 향후 `vector` 확장 (PGVector RAG)

확장 활성화:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- CREATE EXTENSION IF NOT EXISTS vector;  -- REQ-DATA-001 인덱싱 전 활성화
```

## 스키마 개요

| 테이블 | 목적 | PRD 매핑 |
|---|---|---|
| `users` | 사용자·역할 | §8.3, REQ-PLATFORM-002 |
| `subscriptions` | B2C/B2B 구독 | §3 목표 2, 가격 v1.3 |
| `citizen_reporters` | 시민기자 프로필 | REQ-CITIZEN-001 |
| `citizen_articles` | 시민기자 기사 + AI 보조 이력 | Story 4, REQ-GOV-001 |
| `citizen_settlements` | 월간 정산 (v1.4) | Q4-OLD |
| `citizen_training_progress` | 6회 교육 LMS 진도 | REQ-CITIZEN-001 |
| `ai_content_logs` | AI 라벨·HITL 감사 추적 | REQ-GOV-001 |
| `cost_events` | 월 30만원 모니터링 | REQ-COST-001 |
| `sensitive_topic_rules` | 민감 주제 7종 (v1.4) | Q6 |
| `user_preferences` | 초개인화 관심 지역·분야·알림 채널 (v1.7) | REQ-PRODUCT-005 |
| `user_favorites` | 장소·이벤트·리포트 즐겨찾기 (v1.7) | REQ-PRODUCT-005 |
| `notification_subscriptions` | Web Push·이메일·카카오 알림 구독 (v1.7) | REQ-PRODUCT-005 |
| `notification_events` | 알림 발송 이력·재시도 (v1.7) | REQ-PRODUCT-005 |
| `segment_limits` | 세그먼트별 한도 시드 (v1.7) | REQ-PRODUCT-005 |
| `b2g_organizations` | 공공기관 조직 정보 (v1.7) | REQ-PRODUCT-005 |
| `b2g_memberships` | 사용자-조직 매핑 (v1.7) | REQ-PRODUCT-005 |
| `visibility_tier_examples` | 콘텐츠 등급 가이드 시드 (v1.8) | REQ-PRODUCT-005 / REQ-CITIZEN-001 |
| (확장 컬럼) `citizen_articles.visibility_tier` | Critical/Community/Personal (v1.8) | REQ-PRODUCT-005 |
| (확장 컬럼) `ai_content_logs.visibility_tier` | 감사 추적용 (v1.8) | REQ-GOV-001 / REQ-PRODUCT-005 |

## 설계 노트

### Soft delete
`users` 테이블은 `deleted_at` 컬럼으로 soft delete. `citizen_articles`·`subscriptions`는 cascade 정책으로 명시 (보존 vs 삭제 명확화).

### 한 사용자에 활성 구독 1개 제한
부분 인덱스 `uq_one_active_subscription_per_user`로 강제. 비활성 구독은 여러 개 허용 (이력 보존).

### 월간 정산 결제 idempotency
`uq_settlement_reporter_month` 유니크 제약으로 같은 기자·같은 달에 중복 정산 생성 차단.

### 민감 주제 7종 시드
v1.4 결정 (Q6)을 시드 데이터로 포함. 향후 편집부가 UI에서 키워드 보강 가능.

### 비용 이벤트 NUMERIC(12,4)
토큰 단위 미세 비용 (소수점 4자리)까지 보존. 월말 집계 시 정밀도 유지.

## 백엔드 결정 후 변환

PRD §8.4 권장 스택 둘 중 하나로 ORM 코드 생성:
- **FastAPI + SQLAlchemy + Alembic** (Python, LangGraph 통합 용이)
- **NestJS + TypeORM/Prisma** (TypeScript, 프론트와 언어 통일)
