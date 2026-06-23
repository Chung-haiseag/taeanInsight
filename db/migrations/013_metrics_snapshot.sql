-- 리포트 metrics 사전계산 스냅샷 — cron이 주기적으로 채워 요청 경로의 외부 API 팬아웃 제거.
-- 단일 행(id=1). 엔드포인트는 신선하면 이 JSON을 즉시 서빙(전 colo 공통, D1은 글로벌).
CREATE TABLE IF NOT EXISTS metrics_snapshot (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  json        TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
