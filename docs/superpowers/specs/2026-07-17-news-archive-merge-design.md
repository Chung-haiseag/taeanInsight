# 뉴스아카이브 통합 설계

날짜: 2026-07-17
상태: 설계 승인 대기

## 배경 / 문제

상단 메뉴에 `태안뉴스`(`/news`)와 `아카이브`(`/archive`)가 분리되어 있다.

- `아카이브`는 검색 전 **초기화면이 비어 있어** 죽은 화면처럼 보인다.
- 두 메뉴는 사실상 **같은 코퍼스(`archive_articles`)의 다른 뷰**다.
  - 태안뉴스 = 최근 30일 기사를 카테고리로 둘러보기(`/api/news`, RSS 라이브 + 아카이브 병합).
  - 아카이브 = 1990~현재 전체를 전문 검색(`/api/archive/search`, FTS5).
  - 최신 RSS 기사도 매일 자정 ingest로 `archive_articles`에 적재된다 → 아카이브가 상위 집합.
  - 리더 `/news/[id]`는 이미 뉴스 id와 아카이브 idxno를 **공용으로 처리**한다.

즉 중복 메뉴 + 빈 초기화면. 이 둘을 하나로 통합한다.

## 목표

- 상단 메뉴를 **"뉴스아카이브" 1개**로 통합("아카이브" 메뉴 제거).
- **첫 화면부터 최신 기사**가 보이게 한다(빈 화면 제거).
- **상단 카테고리 탭이 전체 아카이브(1990~현재)를 필터**한다.

## 비목표 (YAGNI)

- 리더 `/news/[id]` 변경 없음.
- 새 검색 인프라 없음 — 기존 `/api/archive/search`(FTS5/LIKE) 재사용.
- 관심분야에 따른 **목록 재정렬** 없음(현재 태안뉴스도 목록은 항상 최신순). 관심분야는 **탭 순서/별표**에만 반영.
- URL 쿼리 동기화(`?q=&category=…`)는 선택 사항 — 이번 범위에서 필수 아님.

## 핵심 결정

- 페이지 전체를 `/api/archive/search`가 구동한다. 검색어는 선택적 필터, 카테고리는 탭, 연도는 드롭다운.
- 감수하는 트레이드오프: 화면 전체가 아카이브 구동이라, 당일 갓 올라온 RSS-only 기사는 그날 자정 ingest 전까지 최대 반나절 지연될 수 있다. 주간지 + 매일 ingest라 실질 영향 미미(사용자 승인됨).

## 데이터 흐름

| 상황 | 호출 |
|---|---|
| 기본(검색어 없음, 전체 탭) | `GET /api/archive/search?page=1` → 최신순 목록 |
| 카테고리 탭 | `GET /api/archive/search?category=X&page=N` |
| 검색 | `GET /api/archive/search?q=키워드&category=X&year=YYYY&page=N` |
| 📺 태안군TV 탭 | `GET /api/news/tv`(유튜브 패스스루, 예외) |
| 탭 건수 · 신뢰 배지 | `GET /api/archive/stats` (카테고리 집계 추가) |
| 관심분야(탭 정렬) | `getMe()` → `preferences.categories` (프론트) |

## UI 구성

캐노니컬 라우트 `/news`의 페이지(`web/src/app/news/page.tsx`)를 통합 화면으로 재작성한다.

1. **PageHeader** — eyebrow `News · Archive`, title `뉴스아카이브`, 설명.
2. **신뢰 배지** — `총 N건 · 1990~2026년 디지털 아카이브` (`/stats`).
3. **검색바** — 키워드 input + 연도 select + 검색 버튼. (아카이브의 기존 카테고리 `<select>`는 제거 → 탭이 대체)
4. **상단 카테고리 탭 바** — 태안뉴스와 동일한 pill 스타일:
   `[전체 N] [관광 N] [환경 N] [수산·산업 N] [정책·행정 N] [문화·교육 N] [지역사회 N] [📺 태안군TV]`
   - 탭 = 카테고리 필터(전체 아카이브 최신순). 각 탭에 **전체 아카이브 건수** 표시.
   - 관심분야가 있으면 해당 탭을 앞으로 정렬 + 별표.
5. **기사 리스트** — 공용 기사 행(카테고리 배지 · 날짜 · 저자 · 제목 · 발췌 · 대표사진). 둘러보기/검색 결과 동일 스타일.
6. **페이지네이션** — 이전/다음 + `n / 총페이지`.
7. **상태** — 로딩 / 에러 / 0건 안내.

## 백엔드 변경 (최소)

- `backend/src/archive/router.ts` `/stats`:
  - 기존 `{ total, minYear, maxYear }`에 **카테고리별 COUNT** 추가.
  - 예: `{ total, minYear, maxYear, categories: { tourism: 8231, environment: 6540, … } }`.
  - 기존 1시간 엣지 캐시 유지. `GROUP BY category` 1쿼리.
- 그 외 검색 엔드포인트(`/search`)는 **변경 없음**.

## 라우팅 · 네비게이션

- 캐노니컬 `/news`. `/archive` → `/news` **리다이렉트**(`web/src/app/archive/page.tsx`에서 `redirect("/news")` 또는 `next.config` redirects). 기존 딥링크·검색엔진 유입 보존.
- `web/src/components/site-header.tsx` `NAV_ITEMS`:
  - `/archive` 항목 제거.
  - `/news` 라벨 `태안뉴스` → `뉴스아카이브`.

## 프론트 상태

`web/src/app/news/page.tsx`:
- state: `qInput`(입력 중), `q`(제출된 검색어), `category`(탭, 기본 `all`), `year`, `page`, `hits`, `total`, `totalPages`, `loading`, `error`, `stats`, `interests`, `tv`(태안군TV).
- 탭/검색/연도/페이지 변경 시 `/api/archive/search` 재호출. `category === "tv"`면 `/api/news/tv`.
- `getArchiveStats()`, `getMe()`는 최초 1회.

## 엣지 / 에러

- `/stats` 실패 → 신뢰 배지·탭 건수 생략, 나머지 정상.
- 검색 0건 → "결과가 없습니다" 안내.
- 태안군TV 실패 → 해당 탭만 에러.
- `ARCHIVE_DB` 미바인드 → `/search`가 빈 목록 + note 반환(기존 동작).

## 테스트

- 백엔드: `/stats` 카테고리 집계가 올바른 합계를 반환하는지(단위/수동 curl).
- 프론트(수동):
  1. 첫 로드 시 검색 없이 최신 기사가 보인다(빈 화면 아님).
  2. 카테고리 탭 전환 = 해당 분류 전체 아카이브 최신순.
  3. 검색어 + 연도 + 카테고리 조합.
  4. 📺 태안군TV 탭 재생.
  5. `/archive` 접근 시 `/news`로 리다이렉트.
  6. 리스트 항목 클릭 → `/news/[id]` 리더(뉴스·아카이브 양쪽 id).
