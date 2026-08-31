-- 멤버십 문의 전화번호 설정 (2026-09-01, 사용자 확인).
--
-- 왜 필요한가: `membership_phone`이 비어 있어서 /membership의 `{phone && …}` 블록,
--   곧 **'인터넷이 불편하신가요? 전화 주시면 저희가 대신 처리해 드립니다'**가
--   화면에 아예 없었다. 고령 독자에게는 그게 결제 전 1차 경로이자 신뢰 신호다.
--   계좌(`membership_bank`)는 2026-08-25에 넣었는데 전화만 비어 있었다.
--
-- 번호 출처: 시민기자 지원 완료 화면에 '태안신문사 편집국 ☎ 041-673-7762'로 적혀 있던 것.
--   ⚠ 배포 없이 `/admin` 💳 멤버십 탭에서 언제든 바꿀 수 있다 — 이 파일은 첫 값만 넣는다.

INSERT INTO app_settings (key, value, updated_at)
VALUES ('membership_phone', '041-673-7762', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

-- ── 되돌리기 ────────────────────────────────────────────────────────────────
-- DELETE FROM app_settings WHERE key='membership_phone';
