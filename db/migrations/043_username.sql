-- 로그인 아이디(username) — 이메일 없이도 단순 아이디로 로그인(주로 태안신문 기자 계정).
-- 이메일 계정은 username=NULL. 부분 유니크 인덱스로 NULL 다중 허용 + 비-NULL만 유일.
ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;
