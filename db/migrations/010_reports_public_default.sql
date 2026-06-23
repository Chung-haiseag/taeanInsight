-- 주간 리포트 기본 공개 전환 — 로그인·구독 없이 전체 열람
-- 기존 발행분이 premium_only=1로 잠겨 있던 것을 모두 공개(0)로 전환.
-- 신규 초안은 앱 코드(weekly_pipeline)에서 premiumOnly=false로 생성됨.
UPDATE weekly_reports SET premium_only = 0, updated_at = datetime('now') WHERE premium_only = 1;
