# 온톨로지 확장 Phase 2 — 조직(org) 개체 + 소속(belongs_to) 관계

**목표:** 태안 지식그래프에 **조직(org)** 개체와 **소속(belongs_to: person→org)** 관계를 추가해, 아카이브의 인물 34,510명을 태안군청·수협·군의회 같은 **기관에 연결**한다. "가세로(인물) —소속→ 태안군청(조직)", "○○○ —소속→ 서산수협"이 성립해 AI 답변 근거가 확장되고("태안군청 소속 인물", "수협 관련 인사"), 지식그래프가 인물–기관 층으로 깊어진다.

**범위:** Phase 2는 **조직 + 소속 관계**만. 사건·정책 개체와 주관/추진/관련 관계는 Phase 2b, 액션 층은 Phase 3(본 문서 밖).

## 원칙 (기존 유지)
- **데이터 주도 온톨로지** — `kg_ontology`에 `org` type / `belongs_to` relation 행 추가. 스키마(테이블) 변경 없음(`kg_nodes`/`kg_edges` 재사용).
- **2층 구조** — 조직 시드는 **사실층(verified=1)**, 추출된 소속 후보는 **탐색층(verified=0)**. 기존 규칙 그대로: 탐색층은 통계·관계망에만, **AI 답변 근거·라벨·색은 verified=1만**(지어내기 방지).
- **출처 필수** — 조직 시드는 공식 출처, 소속 후보는 **근거 기사 idxno + 증거 문장**을 `attrs_json`에 저장.
- **도메인·레인지 검증** — `belongs_to`는 person→org만 허용(`isValidEdge`).
- **노 Claude API** — 추출은 **결정론(직함 규칙) 우선**, 애매 후보만 선택적 Gemini Flash-Lite(`thinkingBudget:0`) 확인. Workers 운영코드는 LLM 미사용.
- **안정성(대량)** — 체크포인트/이어하기, 지수 백오프 재시도, 기사별 try/catch 격리.

## 온톨로지 추가 (kg_ontology)

| kind | name | label | spec |
|---|---|---|---|
| type | `org` | 조직 | — |
| relation | `belongs_to` | 소속 | `{"src":"person","dst":"org","attrs":["role","years","evidence"]}` |

## 조직 시드 (kg_nodes, verified=1) — ~22개 핵심 기관
`aliases`(매칭용 별칭 배열)·`attrs_json.category`·`source` 포함.

- **행정**: 태안군청(태안군·군청), 태안군의회(군의회·의회), 충청남도청(충남도청)
- **수산**: 서산수협(서산수산업협동조합), 안면도수협, 태안군수협
- **농업**: 태안농협(태안군농협), 태안서부농협
- **산업/에너지**: 한국서부발전 태안발전본부(태안화력·서부발전)
- **공공안전**: 태안해양경찰서(태안해경), 태안경찰서, 태안소방서, 국립공원공단 태안해안사무소(태안해안국립공원사무소)
- **교육**: 태안교육지원청
- **보건**: 태안군보건의료원(보건소)
- **관광/공사**: 태안군시설관리공단, 한국관광공사(참고)
- **언론**: 태안신문
- **농정/수리**: 한국농어촌공사 태안지사, 태안군산림조합

> 출처: 각 기관 공식 홈페이지·태안군 조직도. 목록은 시드 시 확정(멱등 INSERT OR IGNORE).

## 소속 추출 파이프라인 (tools/kg/, 로컬 배치)

디지털화 파이프라인과 동일한 안정성 패턴. **운영 Worker가 아니라 로컬 스크립트**(대량·이어하기).

1. **대상 좁히기** — 조직 alias를 언급한 기사만(부분집합). 예: 군청·군의회 ~7,161, 수협 ~2,181. 전건(92K) LLM 불필요.
2. **결정론 후보 생성**(핵심, 무료·즉시·고정밀) — 기사 `body`에서 org alias 위치 인근(±40자 창)에서 **직함 큐 + 인접 한국어 인명** 추출:
   - 직함 큐: 조합장·군수·부군수·의장·부의장·과장·국장·계장·소장·서장·청장·본부장·지사장·이사장·회장·위원장·조합원·팀장·센터장 등.
   - 인명: 한글 2~4자 성명 패턴(기존 인물 추출 규칙 재사용). 직함과 인접(예: "서산수협 조합장 홍길동", "홍길동 태안군수").
   - 산출 후보: `(personName, orgId, role, evidence 문장, idxno, year)`.
3. **인물 매칭** — personName → 기존 `kg_nodes(type=person)` id. `name` 정확일치 우선, `aliases` 보조. **동명이인/미존재는 낮은 confidence 또는 보류**(새 person 노드 생성 안 함 — 아카이브 인물집합 신뢰).
4. **(선택) LLM 확인** — 애매 후보(직함 없이 인접만, 또는 인용문 화자)에 대해 Gemini Flash-Lite(thinking off)로 "이 인물이 이 기관 소속인가 vs 단순 언급/인용"만 판정 → confidence 조정. 명확 직함 후보는 LLM 생략.
5. **적재(멱등)** — `kg_edges(rel='belongs_to', verified=0, source=idxno)`. 같은 person–org는 1개 엣지로 병합: `attrs_json = {role, count, confidence, evidence:[문장…최대 3], years:[…], sources:[idxno…]}`. `count`(반복 언급)·`confidence`로 검수 우선순위 랭킹.
   - 체크포인트: 처리한 idxno 배치를 `kv_cache`/로컬 진행파일에 저장, 재실행 시 스킵. 재시도 지수백오프. 기사별 격리.

## 검수·승격 (탐색층 → 사실층)
- 관리자 콘솔에 **소속 후보 검수 큐**: confidence·count 내림차순, 증거 문장·근거 기사 링크와 함께 표시 → **승인 시 verified=0→1**(사실층 편입, AI 근거 사용), 반려 시 유지/삭제.
- **자동 승격은 기본 안 함**(지어내기 방지). 단, "명확 직함 + count≥N + 단일 org" 초고신뢰는 옵션으로 일괄 승인 후보 제시(사람이 최종 클릭).

## 표면 (surface)
- **/data 지식그래프 자동 확장** — `loadKgStats`가 `GROUP BY type/rel`이므로 **조직 개체 수 + 소속 관계 수**가 자동 노출(검수 완료=verified=1 카운트에 소속 승격분 반영).
- **/people 관계망** — 인물 이웃에 **조직 노드 + 소속 엣지** 표시. 기존 규칙대로 **verified=1 소속만 라벨·색**, verified=0은 통계(연결)만.
- **AI 답변 근거** — `buildFactsEvidence`/관계 근거가 **verified=1 belongs_to**를 "확인된 소속 사실"로 인용("○○○은 태안군청 소속(근거: 기사)").

## 구현 순서
1. `db/migrations/050_kg_org.sql` — 온톨로지(org·belongs_to) + 조직 노드(~22, verified=1, aliases, category, source). 원격 D1 적용.
2. `backend/src/kg/affiliation.ts` — 추출 순수 함수(직함 큐 detect, org alias 매칭, 인명 인접 추출, 후보 빌드) + `isValidEdge`에 belongs_to 도메인·레인지. **TDD**.
3. `tools/kg/extract-affiliations.mjs` — D1 스캔(조직 언급 기사)·후보 생성·인물 매칭·(선택)Gemini 확인·verified=0 적재. 체크포인트·재시도·격리. 실행.
4. `backend` 검수 큐 API + `web` 관리자 승격 UI(승인=verified=1). 
5. Surface 확인: /data(조직·소속 카운트)·/people(조직 노드) 반영.

## 검증(테스트) 포인트
- 시드 멱등(재적용 중복 없음), 온톨로지 5type/4relation(person·office·place·commodity·org / coappears·held·handles·belongs_to).
- `belongs_to` 엣지가 도메인·레인지 위반 없이(person→org) 적재, 전부 source·evidence 보유.
- 추출 순수함수: "서산수협 조합장 홍길동" → (홍길동, 서산수협, 조합장) 후보; 직함 없는 단순 언급은 저confidence.
- 동명이인·미존재 인물은 새 노드 생성 안 함(보류/저confidence).
- /kg-stats가 org type·belongs_to relation·카운트 반환. 검수 승격 시 verified 카운트 증가.
- AI 근거·/people 라벨은 verified=1 소속만 사용(verified=0 미노출 검증).

## 범위 밖(다음 단계)
- **Phase 2b**: 사건(event)·정책(policy) 개체 + 주관(org→event)·추진(org→policy)·관련 관계.
- **Phase 3**: 액션 층(취재 배정·알림) + AI 질의에 새 개체 근거 통합.
