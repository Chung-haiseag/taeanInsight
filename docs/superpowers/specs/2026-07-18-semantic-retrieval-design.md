# AI 질의 의미검색(하이브리드 RAG) 설계

날짜: 2026-07-18
상태: 설계 승인 대기
전제: Cloudflare **Workers Paid($5/월)** 활성화(Vectorize 저장 무료 500만 차원 = ~4,800건 벽을 넘기 위함). Paid면 첫 1000만 차원 포함 + 초과 100M당 $0.05 → 60k×1024=61M 차원 ≈ 월 3센트.

## 배경 / 문제

AI 질의(`/api/query`)의 근거 검색(`retrieveArchive`)은 **순수 키워드(FTS5/LIKE)** 만 쓴다. 키워드는 조사·지역어 버그를 고쳤어도 **뜻을 이해 못 한다** — 유사어·개념·종합·"역대 …" 류 질문에 약하다.

프로젝트엔 이미 **Vectorize(taean-articles) + bge-m3 임베딩 함수**가 있으나, **개인화 추천에만** 쓰이고 **최근 30일치만** 임베딩된다(현재 165건). 질의 RAG는 이를 전혀 안 쓴다.

## 목표

- 질의 근거 검색을 **하이브리드(키워드 FTS + 의미 Vectorize)** 로 바꿔 적중률을 높인다.
- **본문 충실 기사 전체(~60k)를 임베딩**해 의미검색이 역사 전체를 커버한다.
- 비용은 Workers Paid 기본요금 외 **월 몇 센트** 수준.

## 비목표 (YAGNI)

- 생성 모델·프롬프트 변경 없음(별도).
- 재랭킹용 외부 리랭커 없음(RRF 정도).
- 전체 104k 임베딩 안 함 — **본문 충실(>500자) ~60k만**(광고·단신 제외).
- 웹RAG(Tavily) 활성화와 무관(이게 잘 되면 불필요).

## 핵심 결정

- 임베딩 모델: 기존 `@cf/baai/bge-m3`(1024d, Workers AI 무료) 재사용.
- 검색 결합: **RRF(Reciprocal Rank Fusion)** — 키워드·의미 각 순위를 `1/(k+rank)`로 합산.
- 백필: **관리자 배치 엔드포인트** + 로컬 루프(R2 정리 때와 동일 패턴). 이미 임베딩된 건 스킵.

## 아키텍처

### (A) 임베딩 백필
- `POST /api/reading/embed-backfill?after=<idxno>&limit=100` (관리자 토큰).
  - `after` 커서 이후 **본문 충실(>500자)·광고 제외** 기사 `limit`건을 idxno 오름차순으로 선택.
  - 각각 bge-m3 임베딩 → `VECTORIZE.upsert`(id=idxno, 메타: idxno/category/title/publishedAt/excerpt) — 기존 `embedRecentArticles`와 동일 메타.
  - 응답: `{ embedded, lastIdxno, done }`(마지막 배치면 done=true).
  - 재실행 안전(upsert). 이미 있는 것 재임베딩해도 무해하나, 커서로 진행.
- **로컬 루프**가 `done`까지 반복 호출(배치 100 × ~600회). Workers AI 무료 하루 ~18k건이라 Paid에서 몇 시간~하루.

### (B) 하이브리드 검색 — `retrieveArchive(env, query)`
- 시그니처 변경: `(db, query)` → `(env, query)` (AI·VECTORIZE 필요). 호출부(router.ts (b)블록)에서 `c.env` 전달.
- 흐름:
  1. **키워드**: 기존 FTS5(bm25 top-8) / LIKE 폴백 → idxno 순위 리스트 A.
  2. **의미**: `embedText(env, query)` → `VECTORIZE.query(vec, {topK:8, returnMetadata:true})` → idxno 순위 리스트 B. (임베딩·질의 실패 시 B=빈 → 키워드만.)
  3. **RRF 병합**: `score(id)=Σ 1/(60+rank)`, 상위 6건 idxno.
  4. 병합 idxno들의 **본문을 D1에서 일괄 로드**(`WHERE idxno IN (...)`, substr(body,1,1300)).
  5. 반환 형태는 기존과 동일(`{idxno,title,published_at,body}`).
- 순수 함수 `rrfMerge(ftsIds, vecIds, k=60, topN=6)` 로 병합 로직 분리(테스트 대상).

## 데이터 흐름 (질의)

```
질문 → retrieveArchive(env, q)
        ├ FTS5 bm25 top8 (키워드)
        ├ embedText(q) → VECTORIZE.query top8 (의미)  [실패 시 키워드만]
        ├ rrfMerge → 상위 6 idxno
        └ D1에서 본문 일괄 로드 → parts에 근거로
      → (기존) 실시간·군정 근거 + 웹(dormant) → LLM 1회 생성
```

## 비용

- 임베딩 백필: bge-m3 무료(하루 ~18k). 60k = 무료 며칠 또는 Paid에서 몇 센트.
- Vectorize 저장: 60k×1024=61M 차원. Paid 첫 1000만 포함 + 초과 51M×$0.05/100M ≈ **월 $0.026**.
- 질의당: 임베딩 1콜(~0.5 neuron) + Vectorize query 1024차원(월 30M 무료 = 무료 ~29k질의). 소규모 트래픽 ₩0.

## 에러 처리 / 안전

- 임베딩·Vectorize 질의 실패 → **키워드 검색으로 폴백**(fail-open, 기존 동작 유지).
- 백필 개별 기사 실패 격리(계속 진행).
- Vectorize 미바인드/Paid 미활성 → 하이브리드는 자동으로 키워드만(회귀 없음).
- 백필 엔드포인트는 `ADMIN_TOKEN` 게이트.

## 테스트

- 순수 단위(TDD): `rrfMerge`(키워드·의미 순위 병합, 중복 idxno 처리, 한쪽 비었을 때, topN 상한).
- 백필 배치 선택 SQL은 수동/소규모 검증(관리자 호출).
- 하이브리드 라이브 검증: "역대 군의원" 등에서 근거 적중이 키워드-only 대비 개선되는지, Vectorize 실패 시 키워드 폴백.

## 전제·순서

1. 운영자: Workers Paid 업그레이드(결제).
2. 구현·배포: 백필 엔드포인트 + 하이브리드 검색(키워드 폴백 내장이라 Paid 전에도 무해).
3. 백필 실행(Paid 활성 후) → 60k 임베딩.
4. 라이브 검증.
