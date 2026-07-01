-- 계정·세션 — Cloudflare 네이티브(외부 인증 없음). 기존 익명 uid를 계정에 귀속·동기화.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  pw_salt TEXT NOT NULL,
  uid TEXT NOT NULL,            -- 이 계정의 정규 익명 uid(개인화 동기화 키)
  display_name TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid);

-- 불투명 세션 토큰(서명키 불필요) → user 조회
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
