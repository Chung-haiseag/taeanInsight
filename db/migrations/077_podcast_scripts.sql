-- 주간 팟캐스트의 대본과 '바탕이 된 기사'를 남긴다 (2026-11-07).
--
-- 왜: tools/podcast/gen-podcast.mjs 는 Gemini로 2인 대담 대본을 쓴 뒤 **음성만 R2에 올리고
--   대본은 버렸다.** 그래서 회차 화면에 들려주는 말을 글로 보여줄 수 없었고(귀가 어두운
--   독자가 읽을 방법이 없다, 검색에도 안 걸린다), 그 회차가 무엇을 바탕으로 만들어졌는지도
--   알 수 없었다.
--   이미 만든 20회차는 되돌릴 수 없다 — 그 회차는 '그 주 주요 기사'로 폴백하고 화면의
--   제목도 바꿔 적는다(없는 것을 '다뤘다'고 적지 않는다. backend/src/reports/router.ts 의
--   /:weekId/episode 가 scripted 플래그로 구분한다).
--
-- duration_sec·bytes 를 함께 남기는 이유: 길이는 재생해 봐야 아는 값이었다. 이제 만들 때 적는다.
--   (지난 회차는 R2 list/head 의 크기를 128kbps CBR 로 환산 — backend/src/reports/episode.ts)

CREATE TABLE IF NOT EXISTS podcast_scripts (
  week_id        TEXT PRIMARY KEY,                       -- ISO 주차 "2026-W45" (weekly_reports.week_id)
  script         TEXT NOT NULL DEFAULT '[]',             -- JSON: [{sp:"A"|"B", text:"..."}]
  article_idxnos TEXT NOT NULL DEFAULT '[]',             -- JSON: number[] — 대본 작성기에 먹인 기사
  duration_sec   INTEGER,                                -- 오디오 길이(초). 모르면 NULL
  bytes          INTEGER,                                -- 업로드한 mp3 크기
  text_model     TEXT,                                   -- 대본을 쓴 모델 (예: gemini-2.5-flash)
  tts_model      TEXT,                                   -- 음성을 만든 모델
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 되돌리기 ────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS podcast_scripts;
--   추가만 하는 변경이다. 기존 테이블·컬럼을 건드리지 않고, 이 테이블이 없으면
--   /:weekId/episode 가 try/catch 로 받아 폴백하므로(tests/podcast_episode.test.ts 가 박제)
--   떨어뜨려도 적용 전 동작으로 그대로 돌아간다.
