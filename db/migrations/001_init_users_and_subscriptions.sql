-- 001_init_users_and_subscriptions.sql
-- 사용자·구독·역할 기본 스키마
-- PRD v1.5 §8.3 사용자/구독 + §6 REQ-PLATFORM-002 SSO

BEGIN;

-- 역할 enum (역할 추가 시 새 마이그레이션에서 ALTER TYPE)
CREATE TYPE user_role AS ENUM (
    'anonymous',
    'b2c_basic',
    'b2c_premium',
    'b2b_basic',
    'b2b_premium',
    'citizen_reporter',
    'editor',
    'admin'
);

CREATE TYPE subscription_status AS ENUM (
    'active',
    'paused',
    'cancelled',
    'past_due'
);

CREATE TYPE subscription_plan AS ENUM (
    'b2c_basic',
    'b2c_premium',
    'b2b_basic',
    'b2b_premium'
);

-- 사용자
CREATE TABLE users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email            VARCHAR(255) UNIQUE NOT NULL,
    taean_account_id VARCHAR(100),                          -- taeannews.co.kr SSO 외래 식별자
    role             user_role NOT NULL DEFAULT 'b2c_basic',
    region           VARCHAR(50),                            -- 읍·면 코드 (예: anmyeon, geunheung)
    display_name     VARCHAR(100),
    phone_e164       VARCHAR(20),                            -- E.164 형식, 암호화는 애플리케이션 계층에서
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMP                               -- soft delete
);

CREATE INDEX idx_users_role             ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_taean_account_id ON users(taean_account_id) WHERE taean_account_id IS NOT NULL;
CREATE INDEX idx_users_region           ON users(region) WHERE deleted_at IS NULL;

-- 구독 (B2C/B2B 모두)
CREATE TABLE subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan                  subscription_plan NOT NULL,
    status                subscription_status NOT NULL DEFAULT 'active',
    started_at            TIMESTAMP NOT NULL,
    current_period_end    TIMESTAMP NOT NULL,
    cancelled_at          TIMESTAMP,
    monthly_price_krw     INTEGER NOT NULL,                  -- 결정된 가격 스냅샷 (v1.3 가격 변동 추적용)
    pg_subscription_id    VARCHAR(100),                       -- 토스페이먼츠 빌링키
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status  ON subscriptions(status) WHERE status = 'active';
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end) WHERE status = 'active';

-- 한 사용자에 동시 활성 구독은 1개만 (활성 외 다른 상태는 허용)
CREATE UNIQUE INDEX uq_one_active_subscription_per_user
    ON subscriptions(user_id)
    WHERE status = 'active';

COMMIT;

-- Rollback
-- BEGIN; DROP TABLE subscriptions; DROP TABLE users; DROP TYPE subscription_plan; DROP TYPE subscription_status; DROP TYPE user_role; COMMIT;
