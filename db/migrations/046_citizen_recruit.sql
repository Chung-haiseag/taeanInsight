-- 2026 시민기자 공개 모집 지원 — 신문 광고/QR로 유입되는 일반인 지원(비로그인).
--   기존 citizen_applications(회원→시민기자 승급)와 별개. 관리자가 8명 선발.
CREATE TABLE IF NOT EXISTS citizen_recruit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  region     TEXT,      -- 읍·면 (태안읍·안면읍·고남면·남면·근흥면·소원면·원북면·이원면)
  age_group  TEXT,      -- 20대~60대+
  interest   TEXT,      -- 관심 분야
  motivation TEXT,      -- 지원 동기(200자)
  status     TEXT NOT NULL DEFAULT 'new',  -- new | selected | rejected
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_citizen_recruit_status ON citizen_recruit(status, created_at);
