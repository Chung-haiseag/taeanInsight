-- 예보 적중률 로그 — 중기 날씨 예보를 기록하고, 대상일이 지나면 관측(env_daily)과 대조해 적중 산출.
--   목적: '우리 예보가 이만큼 맞았다'를 정직하게 공개(예측 신뢰 = 구독 근거). 방문객 실측이 없어 날씨로 검증.
--   강수 적중: 예보 강수확률≥50 → '비 예보', 관측 pty∈(비·소나기·눈…) → '실제 비'. 일치 시 hit.
--   기온: |예보 최고기온 − 관측 기온|, ±2℃ 이내면 적중.
CREATE TABLE IF NOT EXISTS forecast_log (
  target_date TEXT PRIMARY KEY,        -- 예보 대상 날짜(YYYY-MM-DD KST)
  pred_tmax   REAL,                    -- 예보 최고기온(℃)
  pred_pop    INTEGER,                 -- 예보 강수확률(%)
  pred_sky    TEXT,                    -- 예보 하늘
  obs_temp    REAL,                    -- 관측 기온(env_daily.temp)
  obs_pty     TEXT,                    -- 관측 강수형태(env_daily.pty)
  temp_err    REAL,                    -- |예보tmax − 관측temp|
  rain_hit    INTEGER,                 -- 강수 예보 적중(1/0)
  resolved    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_forecast_log_unresolved ON forecast_log(resolved, target_date);
