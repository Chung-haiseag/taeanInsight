-- 시민기자 신청 대기열 — 회원 신청 → 관리자 승인/반려. 승인 시 users.role='citizen'.
CREATE TABLE IF NOT EXISTS citizen_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  reason TEXT,                              -- 신청 사유 / 반려 사유
  applied_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by INTEGER,
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_citizen_app_status ON citizen_applications(status);
