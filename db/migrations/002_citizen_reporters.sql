-- 002_citizen_reporters.sql
-- 시민기자 운영 — 모집·교육·기사·정산
-- PRD v1.5 §6 REQ-CITIZEN-001 + 월간 정산 (Q4-OLD)

BEGIN;

CREATE TYPE citizen_article_status AS ENUM (
    'draft',          -- 작성 중
    'submitted',      -- 편집자 검토 대기
    'reviewing',      -- 편집자가 검토 중
    'revising',       -- 시민기자 수정 요청 받음
    'published',      -- 발행 완료
    'rejected'        -- 발행 거부
);

-- 시민기자 프로필 (users.id를 1:1로 확장)
CREATE TABLE citizen_reporters (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cohort               VARCHAR(20) NOT NULL,              -- '2026' 등 연도 그룹
    recruited_at         TIMESTAMP NOT NULL,
    eup_myeon            VARCHAR(20) NOT NULL,              -- 거주 읍·면 (균형 모집용)
    age_band             VARCHAR(10),                        -- '20s' '30s' '40s' '50s' '60s'
    bio                  TEXT,
    bank_account_number  VARCHAR(50),                        -- 원고료 이체용 (암호화 권장)
    bank_name            VARCHAR(50),
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    active               BOOLEAN NOT NULL DEFAULT TRUE,
    notes                TEXT,                               -- 운영자 메모
    created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_citizen_reporters_cohort       ON citizen_reporters(cohort);
CREATE INDEX idx_citizen_reporters_eup_myeon    ON citizen_reporters(eup_myeon);
CREATE INDEX idx_citizen_reporters_active       ON citizen_reporters(active) WHERE active = TRUE;

-- 시민기자 기사
CREATE TABLE citizen_articles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id     UUID NOT NULL REFERENCES citizen_reporters(user_id) ON DELETE RESTRICT,
    status          citizen_article_status NOT NULL DEFAULT 'draft',
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    cover_image_url TEXT,

    -- AI 보조 사용 이력 (REQ-GOV-001 — AI 라벨 추적)
    ai_assist_log   JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{action, tokens, timestamp}, ...]
    ai_label        VARCHAR(20) NOT NULL DEFAULT 'human',   -- human | ai_assisted | ai_generated

    -- HITL 검토
    submitted_at    TIMESTAMP,
    editor_id       UUID REFERENCES users(id),
    reviewed_at     TIMESTAMP,
    review_notes    TEXT,
    published_at    TIMESTAMP,

    -- 원고료 (월간 정산용 — v1.4 결정)
    fee_krw         INTEGER,                                -- 5만~10만 + 우수 보너스
    settlement_id   UUID,                                    -- citizen_settlements.id (after publish)

    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_citizen_articles_reporter   ON citizen_articles(reporter_id);
CREATE INDEX idx_citizen_articles_status     ON citizen_articles(status);
CREATE INDEX idx_citizen_articles_published  ON citizen_articles(published_at) WHERE status = 'published';
CREATE INDEX idx_citizen_articles_unsettled  ON citizen_articles(reporter_id)
    WHERE status = 'published' AND settlement_id IS NULL;

-- 월간 정산 (PRD v1.4 Q4-OLD 확정: 매월 25일 집계, 말일 계산, 익월 5영업일 이체)
CREATE TYPE settlement_status AS ENUM (
    'pending',        -- 집계 완료, 이체 대기
    'processing',     -- PG 이체 중
    'paid',           -- 이체 완료
    'failed'          -- 실패 (재시도)
);

CREATE TABLE citizen_settlements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id     UUID NOT NULL REFERENCES citizen_reporters(user_id),
    settlement_month CHAR(7) NOT NULL,                       -- 'YYYY-MM'
    article_count   INTEGER NOT NULL,
    base_fee_krw    INTEGER NOT NULL,                        -- 편당 5~10만 합산
    bonus_krw       INTEGER NOT NULL DEFAULT 0,              -- 우수 기자 보너스
    total_krw       INTEGER NOT NULL,
    status          settlement_status NOT NULL DEFAULT 'pending',
    paid_at         TIMESTAMP,
    pg_transfer_id  VARCHAR(100),                            -- 토스페이먼츠 송금 ID
    failure_reason  TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_settlement_reporter_month ON citizen_settlements(reporter_id, settlement_month);
CREATE INDEX idx_settlements_status              ON citizen_settlements(status);
CREATE INDEX idx_settlements_month               ON citizen_settlements(settlement_month);

-- 시민기자 교육 진도 (6회 교육 LMS)
CREATE TABLE citizen_training_progress (
    reporter_id      UUID NOT NULL REFERENCES citizen_reporters(user_id) ON DELETE CASCADE,
    module_index     INTEGER NOT NULL,                       -- 1~6
    completed        BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at     TIMESTAMP,
    quiz_score       INTEGER,                                -- 0~100
    PRIMARY KEY (reporter_id, module_index)
);

COMMIT;

-- Rollback
-- BEGIN;
--   DROP TABLE citizen_training_progress;
--   DROP TABLE citizen_settlements;
--   DROP TABLE citizen_articles;
--   DROP TABLE citizen_reporters;
--   DROP TYPE settlement_status;
--   DROP TYPE citizen_article_status;
-- COMMIT;
