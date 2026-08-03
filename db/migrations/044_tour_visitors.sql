-- 태안 관광 방문자 실측 — 한국관광공사 빅데이터 '지역별 방문자수'(data.go.kr 15101972).
--   관광 수요지수의 '정답(ground truth)'. 관광객=외지인(2)+외국인(3), 현지인(1) 제외.
--   일단위, 매월 17일 전월분 갱신(2~6주 지연). signgu_code=44825(태안군) 고정, 향후 인접 시군구 확장 대비 컬럼 유지.
--   tour_demand_log.actual_visit을 이 표로 채워 백테스트(computeBacktest)가 실측 정답으로 동작한다.
CREATE TABLE IF NOT EXISTS tour_visitors (
  base_ymd    TEXT NOT NULL,      -- YYYYMMDD
  signgu_code TEXT NOT NULL,      -- 44825 태안군
  tou_div_cd  TEXT NOT NULL,      -- 1=현지인, 2=외지인, 3=외국인
  tou_num     REAL NOT NULL,      -- 방문자수(실수)
  daywk_cd    TEXT,               -- 1=월..7=일
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (base_ymd, signgu_code, tou_div_cd)
);
CREATE INDEX IF NOT EXISTS idx_tour_visitors_ymd ON tour_visitors (signgu_code, base_ymd);
