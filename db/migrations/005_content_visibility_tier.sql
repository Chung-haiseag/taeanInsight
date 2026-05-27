-- 005_content_visibility_tier.sql
-- 콘텐츠 가시성 등급 3종 (PRD v1.8 §6 REQ-PRODUCT-005·REQ-CITIZEN-001)
-- 모든 발행 콘텐츠(주간 리포트·시민기자 기사·QA 등)에 등급을 부여하여
-- 초개인화 페이지(/me)에서 사용자 관심사 필터링과 별개로 노출 정책 적용

BEGIN;

-- 가시성 등급 enum
CREATE TYPE content_visibility_tier AS ENUM (
    'critical',     -- 관심사 무관 모든 사용자 노출 (적조·태풍·대형 사고)
    'community',    -- 관심 분야 불일치 시도 작게 노출 (군수 인터뷰·군의회 의결)
    'personal'      -- 관심사 일치 시만 노출 (펜션 추천·일상 정보)
);

-- 시민기자 기사에 등급 컬럼 추가
ALTER TABLE citizen_articles
    ADD COLUMN visibility_tier content_visibility_tier NOT NULL DEFAULT 'personal';

CREATE INDEX idx_citizen_articles_visibility
    ON citizen_articles(visibility_tier, published_at)
    WHERE status = 'published';

-- 주간 리포트는 002 마이그레이션에 정의되지 않았으므로, 향후 reports 테이블 생성 시 같은 컬럼 추가 예정
-- (007_weekly_reports.sql 에서 생성 시 visibility_tier 컬럼 포함 권장)

-- AI 콘텐츠 로그에도 등급 컬럼 추가 (감사 추적용)
ALTER TABLE ai_content_logs
    ADD COLUMN visibility_tier content_visibility_tier;

-- 등급 선택 정책 시드 (편집부·시민기자 가이드)
CREATE TABLE visibility_tier_examples (
    id              SERIAL PRIMARY KEY,
    tier            content_visibility_tier NOT NULL,
    example_topic   TEXT NOT NULL,
    description     TEXT
);

INSERT INTO visibility_tier_examples (tier, example_topic, description) VALUES
    ('critical', '적조 발생 (안면도·만리포 해역)', '관광·환경·부동산 관심 분야 무관 모든 사용자에게 상단 배너 알림 + Web Push 발송'),
    ('critical', '태풍 경보·진로 변경',          '관심 분야 무관 노출, 알림톡 발송 가능'),
    ('critical', '대형 해양 사고·기름 유출',      '관심 분야 무관 노출, 즉시 발송'),
    ('critical', '대규모 인명 사고·재난',         '관심 분야 무관 노출'),
    ('community', '군수 인터뷰·정책 발표',        '정책 분야 외 사용자에게도 본문 하단에 카드로 노출'),
    ('community', '군의회 의결·예산안 통과',      '정책 분야 외 사용자에게도 작게 노출'),
    ('community', '연간 군 단위 행사',           '관광 분야 외에도 노출 (개군일·종합문화축제)'),
    ('personal', '안면도 펜션 추천 7선',          '관광 관심 분야 + 안면도 관심 지역 사용자만'),
    ('personal', '내일 만리포 미세먼지 예보',     '환경 관심 분야 + 만리포 관심 지역만'),
    ('personal', '근흥면 토지 거래 동향',         '부동산 관심 분야 + 근흥면 관심 지역만');

COMMIT;

-- Rollback
-- BEGIN;
--   DROP TABLE visibility_tier_examples;
--   ALTER TABLE ai_content_logs DROP COLUMN visibility_tier;
--   DROP INDEX IF EXISTS idx_citizen_articles_visibility;
--   ALTER TABLE citizen_articles DROP COLUMN visibility_tier;
--   DROP TYPE content_visibility_tier;
-- COMMIT;
