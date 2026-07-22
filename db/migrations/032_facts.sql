-- 큐레이션 사실(fact table) — 열거·전수형 질문(섬 명단·역대 군수·인구 등)에 정확히 답하기 위한
-- 검증된 사실. 질의 키워드와 매칭되면 근거로 주입. RAG로 못 채우는 전수 데이터를 보완.
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,          -- 슬러그(예: taean-islands)
  keywords TEXT NOT NULL,       -- 매칭 키워드(공백 구분, 예: '섬 도서 유인도 무인도')
  title TEXT NOT NULL,
  content TEXT NOT NULL,        -- 검증된 사실 본문
  source TEXT,                  -- 출처
  updated_at TEXT NOT NULL
);
