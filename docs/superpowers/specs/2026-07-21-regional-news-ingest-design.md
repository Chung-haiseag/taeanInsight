# 지역언론 수집(태안 필터) 설계

날짜: 2026-07-21
상태: 설계 승인 대기

## 배경 / 문제

AI 질의가 "올해/최근" 질문에 약하다 — 아카이브(태안신문)는 과거 위주고, 태안신문 외 최신 지역 소식이 없다. 실측 결과 **충남일보·디트뉴스24 등 지역언론 RSS가 Cloudflare Worker에서 200으로 열리고**(WAF 차단 없음), 충남일보엔 "2026 태안군 마을대학", "윤희신 군수 동정", "해수욕장 점검" 등 **현재·태안 특정** 기사가 잡힌다. 군청 행사/공지는 이미 `gov_notices`로 수집·주입 중이므로, 이 스펙은 **지역언론 RSS**만 다룬다.

## 목표

- 태안을 다루는 지역언론 RSS를 주기 수집해 **최신 태안 소식**을 D1에 쌓는다.
- 질의 RAG가 이를 근거로 써서 "올해/최근" 질문의 답을 실데이터로 뒷받침한다.
- ₩0(공식 RSS·키 불필요), 저작권 안전(제목·발췌·원문 링크만).

## 비목표 (YAGNI)

- 전문 저장·재현 안 함 — 제목·발췌·링크만(태안신문 패턴과 동일).
- 군청 소식은 기존 `gov_notices`가 담당 — 여기서 안 함.
- 의미검색(Vectorize) 색인은 이번 범위 밖(키워드 검색으로 충분, 소량·최신).
- 대전일보 등 태안 밀도 낮은 매체는 필터로 자연 배제(넣되 태안 히트만 저장).

## 핵심 결정

- 수집: Worker cron이 RSS 직접 fetch(로컬 미러 불필요 — 도달성 확인됨).
- 필터: 제목+요약에 `태안`/`태안군` 포함 항목만 저장.
- 저장: 새 D1 테이블 `regional_news`, `url` 유일키로 dedup(재실행 안전).
- 주입: 질의 시 키워드·최신 매칭으로 상위 N건을 근거에 추가(원문 링크·매체명 표기).

## 컴포넌트

- **D1 마이그레이션** `db/migrations/NNN_regional_news.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS regional_news (
    url TEXT PRIMARY KEY,
    source TEXT NOT NULL,        -- 매체명
    title TEXT NOT NULL,
    excerpt TEXT,
    published_at TEXT,           -- ISO
    fetched_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_regional_pub ON regional_news(published_at DESC);
  ```
- **수집 모듈** `backend/src/news/regional.ts`:
  - `REGIONAL_FEEDS: {name,url}[]` — 충남일보·디트뉴스24·충청투데이(+대전일보 옵션).
  - `parseRss(xml): {title,url,pubDate,desc}[]` — `<item>` 파싱(CDATA 처리). 순수 함수(테스트 대상).
  - `ingestRegionalNews(env): Promise<{fetched,stored}>` — 각 피드 fetch(UA·타임아웃·실패격리) → 태안 필터 → `INSERT OR IGNORE`(url dedup) → fetched_at 기록.
- **cron** `backend/src/index.ts` scheduled(): 기존 트리거(예: 30분/12h 중 적절한 것)에 `ingestRegionalNews(env)` 추가.
- **질의 주입** `backend/src/query/router.ts`:
  - 아카이브 검색(b) 부근에 `regional_news`에서 질의 키워드(title/excerpt LIKE) 매칭 상위 3건(최신순) 근거 추가. source.url = 원문 링크, source.title = `[매체명] 제목`.
  - 요약만 제공(발췌 excerpt), 원문 복제 금지.
- **정리**: 실측용 임시 엔드포인트 `POST /api/news/_probe-regional` 제거(또는 `ingestRegionalNews` 수동 트리거로 대체).

## 데이터 흐름

```
cron → REGIONAL_FEEDS 각 fetch → parseRss → 태안 필터 → regional_news INSERT OR IGNORE
질의 → (아카이브 하이브리드 + 실시간) + regional_news 키워드 매칭 상위3 → LLM 1회 생성(출처 표기)
```

## 저작권 / 안전

- 제목 + 요약(RSS description 발췌) + 원문 링크만. 전문 저장·재현 없음.
- 출처는 매체명·링크로 표기. 답변은 요약(프롬프트의 "원문 복제 금지" 규칙 적용).
- fetch는 고정된 RSS URL 목록만(사용자 입력 URL 없음).

## 에러 처리

- 개별 피드 fetch/파싱 실패 격리(나머지 계속). 타임아웃 8s.
- `regional_news`/DB 없으면 주입 생략(질의 회귀 0).
- 중복(url) 무시(INSERT OR IGNORE).

## 테스트

- 순수 단위(TDD): `parseRss`(정상 item·CDATA·빈 피드·title 없는 item), 태안 필터.
- 라이브: cron/수동 트리거로 수집 후 `regional_news` 건수 확인, "윤희신 군수"·"마을대학" 질의 시 지역언론 근거가 나오는지.

## 순서

1. 마이그레이션 적용(regional_news).
2. regional.ts(parseRss·ingest) + 테스트.
3. cron 등록 + 질의 주입.
4. 배포 → 수동 트리거로 초기 적재 → 라이브 검증. 임시 프로브 제거.
