-- 엣지 캐시 대체(D1 KV) — Cloudflare Cache API는 workers.dev에서 no-op이라 D1로 대체.
--   외부 API 느린 엔드포인트(agri·auction·fishing)의 콜드 지연 제거: 결과 JSON을 아이솔레이트 간 공유·지속.
--   stale-while-revalidate: 신선하면 즉시, 오래되면 stale 즉시반환 + 백그라운드 갱신.
CREATE TABLE IF NOT EXISTS kv_cache (
  k  TEXT PRIMARY KEY,   -- 캐시 키(agri·auction·fishing 등)
  v  TEXT NOT NULL,      -- 직렬화 JSON
  ts INTEGER NOT NULL    -- 저장 시각(ms)
);
