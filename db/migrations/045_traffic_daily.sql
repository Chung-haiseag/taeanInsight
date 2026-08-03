-- 한국도로공사 실시간 권역 교통량(대전충남본부 903) 일 스냅샷 — 충남 유입 선행지표 추세.
--   trafficRegion(시간당 집계)을 cron이 하루 1회 캡처. (base_date, sum_tm) 유니크.
--   출구=고속도로 진출=충남 도착 유입 ≈ 관광 선행신호. 방문자 실측(지연)의 실시간 보완.
CREATE TABLE IF NOT EXISTS traffic_daily (
  base_date   TEXT NOT NULL,   -- YYYYMMDD (도로공사 sumDate)
  sum_tm      TEXT NOT NULL,   -- 집계 시각(시, "00"~"23")
  region      TEXT,            -- 대전충남본부
  inbound     INTEGER,         -- 입구(진입) 교통량
  outbound    INTEGER,         -- 출구(진출=도착 유입) 교통량
  captured_at TEXT NOT NULL,
  PRIMARY KEY (base_date, sum_tm)
);
CREATE INDEX IF NOT EXISTS idx_traffic_daily_date ON traffic_daily (base_date);
