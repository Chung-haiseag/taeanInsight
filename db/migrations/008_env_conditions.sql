-- 태안 환경 일별 스냅샷 — 날씨·대기질을 하루 1건 보존(주간리포트 추세·차트용)
-- 실시간 값은 캐시 엔드포인트(/api/conditions/taean)에서 제공, 여기엔 일 단위로만 적재.
CREATE TABLE IF NOT EXISTS env_daily (
  date        TEXT PRIMARY KEY,   -- YYYY-MM-DD (KST)
  pm10        INTEGER,            -- 미세먼지 ㎍/㎥
  pm25        INTEGER,            -- 초미세먼지 ㎍/㎥
  o3          REAL,               -- 오존 ppm
  khai_grade  INTEGER,            -- 통합대기환경 등급 1좋음~4매우나쁨
  temp        REAL,               -- 기온 ℃
  humidity    INTEGER,            -- 습도 %
  sky         TEXT,               -- 맑음/구름많음/흐림 (없으면 NULL)
  pty         TEXT,               -- 강수형태 (없음/비/비눈/눈/소나기)
  raw         TEXT,               -- 원본 응답 JSON(디버그용)
  captured_at TEXT
);
