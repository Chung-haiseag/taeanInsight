# 온톨로지 확장 Phase 2b — 사건(event)·정책(policy) + 주관·추진·개최지·관련

**목표:** 지식그래프에 **사건(event)·정책(policy)** 개체를 추가하고, 조직·장소·품목과 **주관(org→event)·추진(org→policy)·개최지(event→place)·관련(event→commodity)** 관계로 엮는다. "태안 기름유출은 무엇·언제", "튤립축제는 누가 주관·어디서·무슨 품목"이 성립.

**범위:** 사건은 **큐레이션(랜드마크) + 축제 자동추출**, 정책은 **큐레이션**만. 액션 층은 Phase 3(밖).

**원칙(기존 유지):** 데이터 주도 온톨로지 · 2층(탐색층 verified=0 / 사실층 verified=1만 AI 근거·지어내기 방지) · 출처 필수 · 도메인/레인지(isValidEdge) · 노 Claude API(축제는 결정론 규칙) · 안정성 패턴.

## 온톨로지 추가 (kg_ontology)
| kind | name | label | spec |
|---|---|---|---|
| type | `event` | 사건 | — |
| type | `policy` | 정책 | — |
| relation | `hosts` | 주관 | `{"src":"org","dst":"event","attrs":["year"]}` |
| relation | `drives` | 추진 | `{"src":"org","dst":"policy","attrs":["year"]}` |
| relation | `held_at` | 개최지 | `{"src":"event","dst":"place","attrs":[]}` |
| relation | `relates` | 관련 | `{"src":"event","dst":"commodity","attrs":[]}` |

## 큐레이션 시드 (verified=1)
**사건(랜드마크)** — 잘 알려진·검증 가능한 것만(보수적):
- 태안 기름유출 사고(2007, 허베이스피릿호) — 재난, 관계 없음(사고)
- 안면도 국제꽃박람회(2002·2009) — 박람회, 주관 충남도청·개최지 안면도
- 태안화력 김용균 사고(2018) — 산재
- 대표 축제 4: 태안튤립축제(주관 군청·개최지 코리아플라워파크)·태안낙조축제(꽃지)·백사장대하축제(백사장·관련 대하)·태안백합꽃축제(군청)

**정책** — 태안군 추진(drives org:taean-gov):
- 태안기업도시(관광레저형)·안면도관광지개발·해양치유센터·가로림만 조력발전(무산)·태안화력 정의로운전환(석탄 폐지)

## 축제 자동추출 (tools/kg/extract-festivals.mjs) — verified=0
- 대상: title·body의 `제?N?회? ○○축제` 패턴(대하·튤립·백합꽃·해삼·자염·사구·국화·목련·수산물대축제 등 실재 다수).
- 정규화: 제N회·연도·공백 제거 → 정규명. 노이즈 제외(문화·거리·지역·대표·가을·요리·해변축제 등 일반명) + **시드된 정규명 제외**(중복 방지). count≥3(실재 반복 축제)만.
- 산출: verified=0 event 노드 `event:fest:<slug>` (attrs: count·years·aliases·evidence). 근거 기사 보존.
- 안정성: 체크포인트·재시도·격리(소속 스크립트와 동일 패턴).

## 검수·승격 (탐색층 → 사실층)
- /admin/kg **🎪 축제 검수** 탭: verified=0 event 노드 목록(count·연도·근거) → 승인(verified=1=사실층)/반려(삭제). 승격 시 필요하면 주관(군청)·개최지 관계는 후속 수동.
- 소속 검수와 동형: 승인 전엔 통계만, AI 근거 아님.

## 표면
- **/data 지식그래프 자동 확장** — event·policy 개체 수 + 주관·추진·개최지·관련 관계 수 자동 노출(loadKgStats GROUP BY).
- AI 근거·/people은 verified=1만(기존 규칙).

## 구현 순서
1. `db/migrations/051_kg_event_policy.sql` — 온톨로지(event·policy·hosts·drives·held_at·relates) + 큐레이션 노드/관계(verified=1). 원격 D1.
2. `backend/src/kg/festival.ts` — 축제명 추출·정규화 순수함수(+TDD).
3. `tools/kg/extract-festivals.mjs` — 스캔·정규화·verified=0 노드 SQL·적재.
4. `backend/src/kg/*` + `web` — 축제 검수 큐(GET /events/pending·reject) + 🎪 검수 탭.
5. 검증: /kg-stats event·policy·관계 카운트, /data 반영.

## 검증(테스트) 포인트
- 온톨로지 7type/8relation, 시드 멱등, 관계 도메인/레인지 준수.
- 축제 정규화: "제28회 태안튤립축제"·"2019 튤립축제" → "태안튤립축제"(또는 튤립축제) 병합; 일반명(문화축제) 제외.
- /kg-stats가 event·policy·hosts·drives 카운트 반환. verified=0 축제는 검수완료(verified=1)에 미포함.

## 범위 밖
- Phase 3: 액션 층(취재 배정·알림) + AI 질의에 event·policy 근거 통합.
- 승격 축제의 주관·개최지 관계 자동연결(후속).
