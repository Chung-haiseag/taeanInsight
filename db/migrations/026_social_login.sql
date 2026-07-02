-- 소셜 로그인(카카오) — users에 provider 컬럼 추가. 기존 이메일 계정은 provider='email'.
ALTER TABLE users ADD COLUMN provider TEXT NOT NULL DEFAULT 'email';
ALTER TABLE users ADD COLUMN provider_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);
