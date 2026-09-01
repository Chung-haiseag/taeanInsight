-- AI 인물 소개 공개 중지 (2026-09-01, 사용자 결정).
--
-- 왜: 인물 그래프가 논란이 될 수 있다는 우려. 측정해 보니 위험은 '얼마나 많이 보여주느냐'가
--   아니라 '무엇을 단정하느냐'에 있었다.
--     · 등장 기사 수·기사 목록·연도 추이·군수 명부·선관위 이력 = 아카이브를 **세어 보여주는 것**.
--       논란이 나도 "우리 기사 N건에 이렇게 나온다"고 답할 수 있다 — 반박이 곧 확인이다.
--     · AI 인물 소개 1,448건 = 모델이 쓴 서술. **근거를 댈 수 없고**, 몇 건이 틀렸는지 우리도 모른다.
--       지역 실명 인물이라 이건 다른 종류의 위험이다.
--   그래서 생성문만 내린다. 집계·관계망·기사 목록은 그대로 둔다.
--
-- ⚠ 코드 기본값도 off다(`SETTING_PUBLIC_PERSON_BIO`) — 설정 줄이 없어도 꺼진 것으로 읽는다.
--   이 줄은 의도를 눈에 보이게 남기려고 넣는다.
-- ⚠ kg_person_bio에 쌓인 1,448건은 **지우지 않는다**. 내보내지 않으면 위험이 아니고,
--   다시 켤 때 즉시 복구된다. 켜고 끄는 것은 `/admin` 보고서 탭의 토글로 배포 없이 된다.
-- ⚠ 질의 답변에 붙던 인물 카드(buildPersonBriefCard)도 같은 스위치를 따른다 —
--   화면만 끄고 답변에 그대로 붙으면 끈 게 아니다.

INSERT INTO app_settings (key, value, updated_at)
VALUES ('public_person_bio', 'off', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

-- ── 되돌리기 ────────────────────────────────────────────────────────────────
-- UPDATE app_settings SET value='on', updated_at=datetime('now') WHERE key='public_person_bio';
-- (또는 /admin 보고서 탭 → '공개 기능 — AI 인물 소개' 켜기)
