-- 003_ai_content_logs_and_cost_events.sql
-- AI 거버넌스(REQ-GOV-001) + 비용 모니터링(REQ-COST-001)
-- PRD v1.5 §8.3

BEGIN;

CREATE TYPE ai_label AS ENUM (
    'human',           -- 사람 작성
    'ai_assisted',     -- AI 보조 (사실 확인·다듬기 등)
    'ai_generated'     -- AI 단독 생성 (HITL 검토 후 발행)
);

CREATE TYPE cost_category AS ENUM (
    'llm_inference',   -- LLM API 호출
    'gpu_compute',     -- (보존) 자체 호스팅 옵션 시
    'external_api',    -- TourAPI·기상청 등 외부
    'storage',
    'pg_fee',          -- 결제 PG 수수료
    'sms_kakao',       -- SMS·카카오톡 알림
    'other'
);

-- AI 콘텐츠 라벨 추적 (감사·신뢰성 보증)
CREATE TABLE ai_content_logs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type      VARCHAR(30) NOT NULL,                -- 'report' | 'qa' | 'article' | 'dashboard'
    resource_id        UUID NOT NULL,
    ai_label           ai_label NOT NULL,
    model_used         VARCHAR(80),                          -- e.g. 'anthropic:claude-haiku' 'together:solar-mini'
    model_channel      VARCHAR(20),                          -- 'batch' | 'realtime'
    hitl_reviewer_id   UUID REFERENCES users(id),
    hitl_reviewed_at   TIMESTAMP,
    sources            JSONB,                                -- 인용 출처 목록 (REQ-GOV-001)
    sensitive_topic    VARCHAR(50),                          -- 민감 주제 7종 분류 결과 (null 가능)
    created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_content_logs_resource  ON ai_content_logs(resource_type, resource_id);
CREATE INDEX idx_ai_content_logs_reviewer  ON ai_content_logs(hitl_reviewer_id);
CREATE INDEX idx_ai_content_logs_sensitive ON ai_content_logs(sensitive_topic) WHERE sensitive_topic IS NOT NULL;

-- 비용 이벤트 (REQ-COST-001 — 월 30만원 모니터링)
CREATE TABLE cost_events (
    id          BIGSERIAL PRIMARY KEY,
    event_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    category    cost_category NOT NULL,
    vendor      VARCHAR(30),                                  -- 'anthropic' | 'together_ai' | 'tour_api' | ...
    amount_krw  NUMERIC(12, 4) NOT NULL,                      -- 소수점 보존 (토큰 단위 미세 비용)
    quantity    NUMERIC(14, 2),                                -- 토큰 수·호출 횟수 등
    unit        VARCHAR(20),                                   -- 'tokens' | 'calls' | 'gb_hours'
    metadata    JSONB
);

-- 월별 비용 집계용 인덱스
CREATE INDEX idx_cost_events_month
    ON cost_events ((date_trunc('month', event_at)));
CREATE INDEX idx_cost_events_day_category
    ON cost_events ((date_trunc('day', event_at)), category);

-- 민감 주제 차단 사전 룩업 (7종 — PRD v1.4 Q6)
CREATE TABLE sensitive_topic_rules (
    topic           VARCHAR(50) PRIMARY KEY,                    -- e.g. 'election', 'crime', 'political_figure'
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    requires_hitl   BOOLEAN NOT NULL DEFAULT TRUE,
    block_ai_only   BOOLEAN NOT NULL DEFAULT TRUE,              -- AI 단독 발행 차단
    keywords        TEXT[] NOT NULL,                            -- 키워드 기반 1차 필터
    description     TEXT,
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 기본 7종 시드 (v1.4 확정)
INSERT INTO sensitive_topic_rules (topic, requires_hitl, block_ai_only, keywords, description) VALUES
    ('election',          TRUE, TRUE,  ARRAY['선거','후보','정당','투표','공천','경선'], '선거 관련 — AI 단독 발행 차단'),
    ('crime',             TRUE, TRUE,  ARRAY['살인','강도','폭행','피의자','피해자','검찰','경찰 조사'], '범죄 사건 — 사실 확인 2단계 강제'),
    ('medical',           TRUE, TRUE,  ARRAY['진단','처방','치료','수술','약물','임상'], '의료 조언 — 전문가 자문 필요'),
    ('religion',          TRUE, TRUE,  ARRAY['교회','사찰','신앙','교리','종파','이단'], '종교 — AI 단독 발행 차단'),
    ('political_figure',  TRUE, FALSE, ARRAY['군수','시장','국회의원','의원','정치인'], '정치 인물 — 편향 검토 필수'),
    ('realestate_speculation', TRUE, FALSE, ARRAY['투자','투기','시세 차익','단기 매매','갭투자'], '부동산 투기 자문 — 면책 조항 자동 부착'),
    ('minority_issues',   TRUE, FALSE, ARRAY['장애','이주민','외국인','성소수자','다문화'], '소수자 이슈 — 차별 표현 자동 스캔');

COMMIT;

-- Rollback
-- BEGIN;
--   DROP TABLE sensitive_topic_rules;
--   DROP TABLE cost_events;
--   DROP TABLE ai_content_logs;
--   DROP TYPE cost_category;
--   DROP TYPE ai_label;
-- COMMIT;
