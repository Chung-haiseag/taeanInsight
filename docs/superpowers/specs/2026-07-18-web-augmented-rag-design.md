# 웹 보강 RAG 설계 (화이트리스트·게이트형)

날짜: 2026-07-18
상태: 설계 승인 대기

## 배경 / 문제

현재 AI 질의응답(`/query`)은 **로컬 RAG**(아카이브 `archive_articles` + 실시간 API: 날씨·대기질·부동산·관광·해양·군청 공지)만 근거로 쓴다. 그래서 아카이브에 없고 실시간 API로도 안 잡히는 질문 — 예: 최근 군청 발표, 지역언론 속보, 충남도 정책 — 은 "정보를 찾지 못했습니다"로 끝난다.

Google NotebookLM/Perplexity처럼 **질문 시점에 외부 웹에서 근거를 가져와** 답변을 보강하고 싶다. 단, 무분별한 오픈 웹이 아니라 **태안 관련 공식·지역 도메인 화이트리스트**로 한정한다.

## 목표

- 로컬 근거가 약할 때 **화이트리스트 웹 검색으로 근거를 보강**한다.
- 웹 근거는 **출처(도메인·수집일·링크)를 아카이브/실시간과 구분해 표기**한다.
- 프로젝트 제약(Cloudflare 전용·무료 우선·공식 API 우선·저작권·안전)을 지킨다.

## 비목표 (YAGNI)

- 오픈 웹 전체 검색 안 함 — 화이트리스트 도메인만.
- 사용자가 소스 URL을 직접 올리는 NotebookLM식 개인 노트북 안 함(별도 기능).
- 매 질문 웹 검색 안 함 — **게이트로 로컬이 약할 때만**.
- 웹 원문 저장·복제 안 함 — 요약 + 링크만.
- 기존 실시간 API 경로(군청·TourAPI·data.go.kr) 대체 안 함 — 웹은 **보강**.

## 핵심 결정

- **Perplexity형·게이트형**: 로컬 RAG를 먼저 돌리고, 근거가 약하거나 "최신·상황" 질문일 때만 웹 검색 발동.
- **화이트리스트 한정**: 태안 관련 공식·지역 도메인만 검색·fetch.
- **무료 티어 검색 API + Workers fetch**: 검색 provider로 URL을 찾고 본문을 가져옴(provider 교체 가능한 인터페이스).

## 데이터 흐름

```
질문 → [로컬 RAG: 아카이브+실시간 근거 수집]  (기존 그대로)
      → needsWeb(query, localParts)?
          ├ 아니오 ────────────────────→ LLM 1회 생성 → 답변
          └ 예(로컬 약함/최신 의도)
               → searchWeb(query, 화이트리스트)  [캐시 우선]
               → 상위 N개 WebSource(요약 본문)
               → localParts + webParts 합쳐 LLM 1회 생성 → 답변(웹 출처 별도 표기)
```

핵심: **웹이 발동해도 LLM 생성은 1회.** 로컬 답변을 따로 생성했다가 재생성하지 않는다(비용·지연 절감). 게이트는 생성 **전** 검색 신호로 판정.

## 게이트 로직 — `needsWeb(query, localParts)`

로컬이 약하거나 최신-상황 질문이면 `true`:

- **로컬 약함**: 아카이브 근거 0건 **그리고** 강한 실시간/공지 근거(날씨·부동산·관광·해양·gov_notices)도 없음.
- **최신-상황 의도**: 질문에 최신성 신호(예: `최근|현재|요즘|오늘|어제|발표|공고|속보|입장|계획|추진|결정` 등) 포함.
- (순수 함수 — `localParts` 개수·종류와 질의 문자열만으로 판정.)

## 컴포넌트 (파일 단위, 각각 독립 테스트)

- `backend/src/query/web/whitelist.ts`
  - `WEB_WHITELIST: string[]` — 초기값: `taean.go.kr`, `chungnam.go.kr`, `korea.kr`(정책브리핑), `data.go.kr`, `visitkorea.or.kr`(관광공사) + 태안 관련 지역언론 도메인(운영자 확정).
  - `isAllowedDomain(url: string): boolean` — 호스트가 화이트리스트(또는 서브도메인)에 속하는지. **fetch 직전·검색결과 필터 양쪽에서 강제**(SSRF·범위이탈 차단).
- `backend/src/query/web/gate.ts`
  - `needsWeb(query: string, localParts: LocalPart[]): boolean` (순수).
- `backend/src/query/web/search.ts`
  - `interface WebSource { url: string; title: string; text: string; publishedAt?: string }`
  - `searchWeb(env, query): Promise<WebSource[]>` — 검색 provider 호출(도메인 include=화이트리스트) → 결과를 `isAllowedDomain`로 재필터 → 본문 길이 상한(예: 1500자) → 상위 3건. 캐시 경유. 실패 시 `[]`(fail-open).
  - Provider 인터페이스로 교체 가능. **기본 구현: Tavily**(검색+본문추출 1콜, `include_domains` 지원 → 코드 최소). **대안: Brave Search + `fetch_extract`**(동일 인터페이스, 신규 벤더 선호 안 하면 전환). 구현 태스크에서 확정.
- `backend/src/query/web/fetch_extract.ts` (Brave 경로에서만 필요)
  - `extractMainText(html: string): string` — HTML→본문 텍스트(순수, 테스트). Workers `fetch()` + 타임아웃 4s + `isAllowedDomain` 가드.
- `backend/src/query/web/cache.ts`
  - 검색 결과를 D1 TTL 캐시(기존 `lib/api_cache` 위에). 키: `web:<query정규화 해시>`. TTL 예: 6시간(공지·뉴스 갱신 주기 고려).
- `backend/src/query/router.ts` (통합점)
  - 로컬 `parts` 수집 후 `needsWeb`면 `searchWeb` 결과를 `parts`에 추가(source.kind="web"). 병렬·타임아웃·실패격리.
- `web/src/app/query/query-client.tsx`
  - 출처 렌더에 **"웹 출처"** 그룹 추가(도메인·수집일·링크). 아카이브/실시간과 시각적 구분.

## 검색 provider (시크릿)

- `WEB_SEARCH_API_KEY` — wrangler secret. 무료 티어(Tavily ~1k/월 또는 Brave 2k/월).
- 게이트로 소수 질문에서만 발동 → 무료 한도 내 가능성. 키 미설정 시 웹 보강 자동 비활성(로컬만).

## 출처 표기 · 저작권

- 웹 근거는 **요약만**, 원문 문장 복제 금지(기존 태안뉴스 발췌 패턴과 동일 원칙).
- 출처 카드: `도메인 · 제목 · 수집일 · 원문 링크`. 답변 본문엔 `[번호]` 인용.
- 신뢰 순위: 공식(.go.kr)·관광공사 > 지역언론. 프롬프트에 "공식·지역 출처 우선, 최신성 명시, 원문 복제 금지" 지침 추가.

## 안전

- **화이트리스트 도메인만 fetch** — `isAllowedDomain`을 검색결과 필터와 fetch 직전 양쪽에서 강제(SSRF·오남용 차단).
- 사용자 입력 URL 직접 fetch 안 함(검색이 선택한 화이트리스트 URL만).
- 개인정보·비화이트리스트로의 데이터 전송 없음.

## 에러 처리

- 검색·fetch·파싱 실패 → **웹 근거 없이 로컬 답변으로 폴백**(fail-open, 사용자에겐 그냥 로컬 답변).
- 개별 URL 실패는 격리(나머지 결과로 진행). 전체 웹 단계 타임아웃(예: 6s) 초과 시 로컬로 폴백.
- 키 미설정·provider 오류 → 웹 비활성.

## 설정 / 배포

- 시크릿 `WEB_SEARCH_API_KEY`(wrangler secret put).
- 화이트리스트는 코드 상수(`whitelist.ts`) — 운영자가 지역언론 도메인 확정 후 추가.
- 백엔드만 변경(+ 프론트 출처 렌더). 웹/백엔드 독립 배포 안전(키 없으면 로컬로 동작).

## 테스트

- 순수 단위(TDD): `isAllowedDomain`(서브도메인·비허용·잘못된 URL), `needsWeb`(로컬충분→false / 0건+최신의도→true / 실시간근거있음→false), `extractMainText`(HTML→본문), 캐시 키 정규화.
- provider 호출·fetch는 mock(가짜 응답)으로 `searchWeb`의 필터·상한·fail-open 검증.
- 수동/라이브: 아카이브에 없는 최신 군청 공지 질문 → 웹 출처로 답변, 로컬로 충분한 질문 → 웹 미발동(속도 유지), 키 미설정 시 로컬 폴백.
