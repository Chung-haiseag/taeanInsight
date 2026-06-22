-- 관광 수요지수 로그 — 매일 계산한 다가오는 주말 지수를 누적 저장.
-- 향후 실제 방문자/검색량(actual_*)을 채워 백테스트(MAPE)로 규칙·가중치를 보정한다.
CREATE TABLE IF NOT EXISTS tour_demand_log (
  weekend_sat   TEXT NOT NULL,            -- 대상 주말 토요일 YYYY-MM-DD
  captured_at   TEXT NOT NULL,            -- 계산 시각(ISO) — 예보가 갱신되므로 같은 주말이 여러 번 기록됨
  idx           INTEGER NOT NULL,         -- 수요지수 0~100
  level         TEXT NOT NULL,            -- 매우높음|높음|보통|낮음|매우낮음
  factors       TEXT NOT NULL DEFAULT '[]', -- JSON: 기여요인 배열(근거)
  weather       TEXT,                     -- JSON: 토/일 예보 스냅샷
  actual_visit  INTEGER,                  -- (향후) 실제 방문자 추정치 — 백테스트용
  actual_search INTEGER,                  -- (향후) 검색 트렌드 실측 — 백테스트용
  PRIMARY KEY (weekend_sat, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_tour_demand_sat ON tour_demand_log (weekend_sat);
