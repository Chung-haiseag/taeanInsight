-- 004_personalization_and_b2g.sql
-- 초개인화 + B2G 세그먼트 (PRD v1.7 신규)
-- 매핑: REQ-PRODUCT-005

BEGIN;

-- 'b2g'를 user_role enum에 추가 (001에 정의된 enum 확장)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'b2g';

-- B2G 조직 (군청·읍면사무소·교육청·연구기관)
CREATE TABLE b2g_organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    org_type        VARCHAR(30) NOT NULL CHECK (org_type IN ('county','eup_myeon','education','research','other')),
    business_number VARCHAR(20),                          -- 사업자번호·기관 코드
    contract_at     DATE,
    notes           TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_b2g_orgs_type ON b2g_organizations(org_type);

-- B2G 멤버십 (한 사용자가 여러 부서 소속 가능)
CREATE TABLE b2g_memberships (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id      UUID NOT NULL REFERENCES b2g_organizations(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
    joined_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, org_id)
);

CREATE INDEX idx_b2g_memberships_org ON b2g_memberships(org_id);

-- 초개인화 사용자 설정
CREATE TABLE user_preferences (
    user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    segment               VARCHAR(20) NOT NULL,                 -- b2c_basic | b2c_premium | b2b_basic | b2b_premium | b2g
    regions               TEXT[] NOT NULL DEFAULT '{}',         -- 읍·면 코드 배열 (anmyeon·geunheung 등)
    categories            TEXT[] NOT NULL DEFAULT '{}',         -- tourism | environment | realestate | policy | industry | culture
    notification_channels TEXT[] NOT NULL DEFAULT '{}',         -- email | webpush | kakao
    onboarded_at          TIMESTAMP,
    updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_prefs_segment ON user_preferences(segment);

-- 세그먼트별 한도 (애플리케이션 레이어에서 강제, 참고용 시드)
CREATE TABLE segment_limits (
    segment           VARCHAR(20) PRIMARY KEY,
    max_regions       INT NOT NULL,
    max_categories    INT NOT NULL,
    max_favorites     INT NOT NULL,
    max_team_members  INT NOT NULL DEFAULT 1,
    premium_pdf       BOOLEAN NOT NULL DEFAULT FALSE,
    description       TEXT
);

INSERT INTO segment_limits (segment, max_regions, max_categories, max_favorites, max_team_members, premium_pdf, description) VALUES
    ('b2c_basic',    2, 2, 10, 1, FALSE, '월 5천원 기본 구독'),
    ('b2c_premium',  5, 4, 50, 1, TRUE,  '월 1.5만원 프리미엄 - 맞춤 PDF 다운로드 포함'),
    ('b2b_basic',    5, 4, 100, 3, TRUE, '월 3만원 기본 - 상권 분석 카드, 팀원 3명'),
    ('b2b_premium', 10, 6, 200, 10, TRUE, '월 8만원 프리미엄 - 맞춤 분석 의뢰, 팀원 10명'),
    ('b2g',          5, 6, 500, 20, TRUE, '공공기관 - 부서 공유 공간, 보고서 자동 생성, 가격 별도 협의');

-- 즐겨찾기 (장소·이벤트·리포트·기사)
CREATE TABLE user_favorites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        VARCHAR(20) NOT NULL CHECK (kind IN ('place','event','report','article','dashboard_widget')),
    ref_id      VARCHAR(100) NOT NULL,
    label       VARCHAR(200),                              -- 사용자 지정 별명
    metadata    JSONB,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, kind, ref_id)
);

CREATE INDEX idx_user_favorites_user_kind ON user_favorites(user_id, kind);

-- 알림 구독 (Web Push·이메일·카카오)
CREATE TABLE notification_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel     VARCHAR(20) NOT NULL CHECK (channel IN ('webpush','email','kakao')),
    endpoint    TEXT NOT NULL,                             -- Web Push URL · 이메일 · kakao_uid
    p256dh_key  TEXT,                                       -- Web Push 전용
    auth_key    TEXT,                                       -- Web Push 전용
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, channel, endpoint)
);

CREATE INDEX idx_notif_subs_user_enabled ON notification_subscriptions(user_id) WHERE enabled = TRUE;

-- 알림 발송 이력 (감사·중복 방지)
CREATE TABLE notification_events (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel         VARCHAR(20) NOT NULL,
    subject         VARCHAR(50) NOT NULL,                  -- 'red_tide_alert' · 'weekly_report_ready' · 'event_reminder'
    payload         JSONB,
    status          VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued | sent | failed
    delivered_at    TIMESTAMP,
    error_message   TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_events_user_subject ON notification_events(user_id, subject);
CREATE INDEX idx_notif_events_status      ON notification_events(status) WHERE status IN ('queued','failed');

COMMIT;

-- Rollback
-- BEGIN;
--   DROP TABLE notification_events;
--   DROP TABLE notification_subscriptions;
--   DROP TABLE user_favorites;
--   DROP TABLE segment_limits;
--   DROP TABLE user_preferences;
--   DROP TABLE b2g_memberships;
--   DROP TABLE b2g_organizations;
--   -- ALTER TYPE user_role 의 'b2g' 값 제거는 PostgreSQL에서 직접 지원하지 않음 (재생성 필요)
-- COMMIT;
