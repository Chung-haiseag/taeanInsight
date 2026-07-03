-- 멤버십 사전 신청(수요 검증) — 결제(PG) 연동 전 실수요를 수치로 확보.
CREATE TABLE IF NOT EXISTS subscription_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  plan TEXT NOT NULL,           -- reader(독자) | business(사장님) | org(기관)
  name TEXT,                    -- 이름/상호/기관명
  note TEXT,                    -- 업종·요청사항
  created_at TEXT NOT NULL,
  UNIQUE(email, plan)
);
