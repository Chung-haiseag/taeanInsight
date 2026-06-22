-- 주간 인사이트 리포트 — REQ-PRODUCT-001 / TaskMaster #22
-- taean-archive(D1/SQLite)에 적재. 초안 생성(목 야간 cron) → HITL 검토 → 발행.
-- 섹션은 JSON 배열(ReportSection[])로 한 컬럼에 저장 (MVP — 별도 테이블 불필요).
CREATE TABLE IF NOT EXISTS weekly_reports (
  week_id          TEXT PRIMARY KEY,                       -- ISO 주차 "2026-W25"
  status           TEXT NOT NULL DEFAULT 'draft',          -- draft | in_review | published
  summary          TEXT NOT NULL DEFAULT '',               -- 요약 섹션 본문(목록 노출용)
  sections         TEXT NOT NULL DEFAULT '[]',             -- JSON: ReportSection[]
  ai_label         TEXT NOT NULL DEFAULT 'ai_assisted',    -- human | ai_assisted | ai_generated
  hitl_reviewer_id TEXT,                                   -- 발행 승인한 검토자 (HITL)
  visibility_tier  TEXT NOT NULL DEFAULT 'community',      -- critical | community | personal
  premium_only     INTEGER NOT NULL DEFAULT 0,             -- 0=기본 공개(로그인 없이 전체), 1이면 비구독자 미리보기만
  pdf_url          TEXT,                                   -- (향후) PDF 렌더 결과
  generated_at     TEXT,                                   -- LLM 초안 생성 시각(ISO)
  published_at     TEXT,                                   -- 발행 확정 시각(ISO, 미발행 NULL)
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 목록·최신 발행 조회용 (발행분만 최신순)
CREATE INDEX IF NOT EXISTS idx_weekly_reports_published
  ON weekly_reports (status, published_at DESC);
