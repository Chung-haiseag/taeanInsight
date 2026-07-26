# 태안 인사이트 — 5단계 v1: 관계 라벨링 (설계 스펙)

작성일: 2026-07-27
상태: 설계 확정(브레인스토밍 완료, 사용자 승인) · 구현 계획 대기
선행: 인물 그래프(34,510인물·coappears 1,267,083엣지, 전부 verified=0)·관계도 UI·검수 콘솔 라이브.

## 1. 목표
공동등장(coappears) 엣지 중 **강한 관계(weight≥10, ~3,880쌍)** 에 **관계 종류**(협력·대립·소속·전임후임·가족·기타)를 붙인다. 로컬 Gemini 스크립트가 그 쌍의 대표 기사 제목을 읽고 분류해 엣지 attrs에 저장하고, 관계도 UI가 라벨을 표시한다.

## 2. 배경
- `kg_edges`(rel=coappears): attrs_json에 `weight`(공유 기사 수) + `articles`(대표 idxno 최대 20개) 이미 저장됨 → **이 대표 기사로 관계 분류**.
- 현재 관계도 엣지는 라벨 없음(선만). weight≥10: 3,880쌍.
- 추출 관례: 로컬 Gemini 스크립트(tools/kg), verified=0. graph.ts의 Edge=`{a,b,weight}`, resolveCanonical이 병합 시 weight 합.

## 3. 범위
### v1
- weight≥10 coappears 엣지에 `reltype`+`relreason` 라벨링(로컬 스크립트). graph.ts Edge에 reltype 포함. KgGraph 엣지 라벨 표시.
### 비범위(이후)
- weight<10 확대, 방향성(A→B) 관계, 조직·정책 관계, 온톨로지 정식 관계로 승격, 공개 전환.

## 4. 결정 요약
| 항목 | 선택 |
|---|---|
| 범위 | weight≥10 (~3,880쌍) |
| 어휘 | 협력·동료 / 대립·갈등 / 소속·상하 / 전임·후임 / 가족·인척 / 기타 |
| 방식 | 로컬 Gemini Flash-Lite(thinking off), 대표 기사 제목 근거 |
| 저장 | `kg_edges.attrs_json`에 reltype·relreason(스키마 변경 없음) |
| 표시 | 그래프 엣지에 라벨 |

## 5. 아키텍처(한 문장)
`tools/kg/label-relations.mjs`가 weight≥10·미라벨 엣지의 `attrs.articles`→기사 제목을 Gemini로 분류→`attrs.reltype`/`relreason` 병합(INSERT OR REPLACE, verified=0). graph.ts가 reltype을 Edge에 실어 KgGraph가 라벨 렌더. AI 답변·기존 라우트 무변경.

## 6. 관계 어휘 (순수 로직 `tools/kg/label-lib.mjs`)
- 허용: `협력·동료`, `대립·갈등`, `소속·상하`, `전임·후임`, `가족·인척`, `기타`.
- `normalizeReltype(raw)`: Gemini가 준 값을 허용 어휘로 매핑, 밖이면 `기타`. **TDD.**

## 7. 라벨링 스크립트 (`tools/kg/label-relations.mjs`, ebook 패턴)
- 대상: `SELECT id, src_id, dst_id, attrs_json FROM kg_edges WHERE rel='coappears' AND CAST(json_extract(attrs_json,'$.weight') AS INT)>=10 AND json_extract(attrs_json,'$.reltype') IS NULL`(이미 라벨된 것 제외 → 체크포인트/이어하기).
- 각 엣지: attrs.articles idxno들 → `archive_articles`에서 제목 조회(배치/캐시). 두 인물 이름(kg_nodes)+제목 목록을 Gemini(Flash-Lite, thinkingBudget:0)에 주고 `{"reltype":"...","reason":"..."}` 반환. 프롬프트: 허용 어휘 중 하나·제목 근거로만·불명확하면 기타.
- `normalizeReltype`으로 어휘 강제. attrs_json에 reltype·relreason 병합(기존 weight/articles 유지) → `INSERT OR REPLACE INTO kg_edges(...)` verified=0. d1file 재시도·단일실패 격리.
- `--dry`·`--limit`.

## 8. 조회·표시
- `graph.ts`: `parseWeight` 옆에 attrs에서 `reltype` 파싱. `Edge` 인터페이스에 `reltype?: string` 추가. articlePersonGraph·personEgo 엣지에 reltype 실음.
- `merge.ts resolveCanonical`: 중복 엣지 병합 시 weight 합 + **reltype는 먼저 나온 비어있지 않은 값 유지**(둘 다 있으면 기존 유지). 테스트 보강.
- `KgGraph`(캔버스): 엣지에 reltype 있으면 **선 중앙에 라벨**(할로 처리, 데모 방식). 없으면 선만.

## 9. 무결성·범위
- 자동 라벨 = **verified=0 유지 → AI 답변 무영향**(그래프 표시에만).
- Gemini는 **제목 근거로만** 분류, 어휘 밖·불명확은 `기타`(지어내기 방지 연장).
- 증분·체크포인트(미라벨만)·재시도·단일실패 격리. 원격 실행·배포는 승인 후.
- 스키마 변경 없음(attrs_json 확장).

## 10. 테스트
- 순수 TDD: `normalizeReltype`(허용 어휘 매핑·밖은 기타·빈값 기타). graph.ts reltype 파싱은 얇은 D1(tsc). resolveCanonical reltype 보존 테스트. KgGraph는 빌드+수동.

## 11. 성공 기준
- 스크립트가 weight≥10 엣지에 관계 종류를 채우고, 관리자 관계도에서 강한 관계 선에 **라벨(협력·대립 등)** 이 뜬다. AI 답변·기존 화면 회귀 없음. 어휘 밖 값 없음.

## 12. 후속
- weight 확대, 방향성 관계, 조직·정책 관계, 온톨로지 승격.
