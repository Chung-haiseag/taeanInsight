-- 멤버십 주문(계좌이체) — 무통장 입금 → 관리자 확인 → 등급 부여.
--   PG 가맹점 계약 없이 오늘 바로 도는 경로. 카드결제가 붙어도 이 표를 그대로 쓴다(결제수단만 늘어난다).
--   ⚠ 등급을 여는 문은 '입금 확인' 하나뿐이다. 판정 규칙은 backend/src/membership/plan.ts.
CREATE TABLE IF NOT EXISTS membership_orders (
  code        TEXT PRIMARY KEY,          -- 'TA-2608-A7K3' — 전화로 불러줄 수 있는 번호
  user_id     INTEGER NOT NULL,
  plan        TEXT    NOT NULL,
  months      INTEGER NOT NULL,
  amount      INTEGER NOT NULL,          -- 원
  depositor   TEXT    NOT NULL,          -- 입금자명 — 통장에 찍히는 이름. 이걸로 대조한다
  contact     TEXT,                      -- 연락처(선택) — 입금자명이 달라 못 찾을 때 쓴다
  status      TEXT    NOT NULL DEFAULT 'pending',  -- pending | paid | cancelled
  created_at  TEXT    NOT NULL,
  confirmed_at TEXT,
  confirmed_by TEXT,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_membership_orders_status ON membership_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_membership_orders_user   ON membership_orders(user_id, created_at DESC);

-- 멤버십 만료일. NULL = 무기한(관리자가 손으로 준 기관·제휴 등급).
ALTER TABLE users ADD COLUMN plan_until TEXT;
