-- 회원 구분 — role(user|reporter|admin) + plan(free|reader|business|org).
-- 결제(PG) 전에는 관리자가 /admin 회원 탭에서 수동 부여.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
