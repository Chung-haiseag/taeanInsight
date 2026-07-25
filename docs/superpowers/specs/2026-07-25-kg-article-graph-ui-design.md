# 태안 인사이트 — 6단계 v1: 기사 인물 관계도 UI (설계 스펙)

작성일: 2026-07-25
상태: 설계 확정(브레인스토밍 완료, 사용자 승인) · 구현 계획 대기
선행: KG substrate(033)·인물 추출 도구(034, tools/kg)·군수 Fact 라이브.

## 1. 목표
기사 상세 페이지에 **관리자/베타 전용 "이 기사 인물 관계도"** 를 붙인다. 기사에 등장한 인물(kg_mentions)과 그들 사이 공동등장(kg_edges coappears)을 그래프로 보여주고, 인물 클릭 시 ego(전체에서 함께 많이 등장한 인물)로 확장한다.

## 2. 배경
- 데이터: `kg_mentions`(인물×기사)·`kg_edges`(rel=coappears, verified=0)·`kg_nodes`(person). 자동추출·미검수(동명이인 병합 가능).
- 기사 상세: `web/src/app/news/[id]/{page.tsx,article-client.tsx}`(article-client는 이미 client 컴포넌트).
- 관리자 게이트: `apiFetch`(`web/src/lib/api/client.ts`)가 `sessionStorage["taean-admin-token"]`을 `X-Admin-Token`으로 자동 부착. `/api/admin/*`는 백엔드 adminGuard 보호.
- 렌더: 그래프 라이브러리 없음 → **데모 아티팩트의 자체 캔버스 포스그래프를 React 컴포넌트로 이식**(무거운 의존성 없음).

## 3. 범위
### v1
- 기사 단위 인물 관계도(관리자 게이트) + 인물 클릭 ego 확장. 자체 캔버스 렌더. 백엔드 그래프 서빙 API 2개.
### 비범위(이후)
- 공개 노출(검수 4단계 후), 전용 탐색 페이지, 인물별 페이지, 조직·장소 등 다중 개체 그래프, 근거 기사 클릭 목록(엣지→기사) 심화.

## 4. 결정 요약
| 항목 | 선택 |
|---|---|
| 진입점 | 기사 상세 "이 기사 인물 관계도" + 클릭 ego 확장 |
| 공개 범위 | 관리자/베타 게이트(라벨 "자동추출·검수 전 베타") |
| 렌더 | 자체 캔버스 포스그래프 재사용(외부 라이브러리 없음) |
| ego 확장 | 같은 캔버스에서 확장 |

## 5. 아키텍처(한 문장)
백엔드 `/api/admin/kg/*`에 기사 그래프·인물 ego 조회 엔드포인트를 추가하고, 프런트 기사 상세에 관리자 전용 그래프 섹션(자체 캔버스 컴포넌트)을 붙인다. 질의 경로·기존 라우트는 무변경.

## 6. 게이팅
- 섹션은 관리자 토큰이 있을 때만 렌더(엔드포인트가 401이면 숨김). 라벨 "자동 추출 · 검수 전 (베타)".
- 데이터 없는 기사(추출 미실행)엔 섹션 미표시(우아한 빈 상태).

## 7. 백엔드 API (관리자 가드, `backend/src/kg/admin_router.ts` 확장)
- `GET /api/admin/kg/article/:idxno/graph` →
  `{ nodes: [{ id, name, mentions }], edges: [{ a, b, weight }] }`
  (그 기사에 등장한 person 노드 + 그 집합 내부 coappears 엣지)
- `GET /api/admin/kg/person/:id/ego?limit=12` →
  `{ center: { id, name }, nodes: [{ id, name, mentions }], edges: [{ a, b, weight }] }`
  (id에 인접한 coappears 상위 weight 이웃 + 엣지)

## 8. 리포지토리·순수 로직 (`backend/src/kg/graph.ts` 신규 + repository 활용)
- 순수 `rankNeighbors(edges, centerId, limit)`: 각 엣지 `{a,b,weight}` 중 centerId 인접분에서 상대 id·weight 추출 → weight 내림차순 → 상한 limit → `[{id, weight}]`(self 제외, 중복 병합). **TDD.**
- 얇은 D1: `articlePersonGraph(db, idxno)`, `personEgo(db, id, limit)` — kg_mentions/kg_edges/kg_nodes 조회 후 위 형태 반환. mentions 수 = COUNT(kg_mentions). tsc + 스모크.

## 9. 프런트
- **`web/src/components/kg-graph.tsx`** (client): 데모 캔버스 포스그래프 이식. props `{ nodes, edges, onNodeClick, height? }`. 노드 크기=mentions, 색=단일 액센트(person 단일 타입), 다크/라이트·reduced-motion 대응, DPR 스케일. 외부 라이브러리 없음.
- **`web/src/app/news/[id]/article-graph.tsx`** (client, 신규): 관리자 토큰 확인 → `apiFetch("/api/admin/kg/article/<idxno>/graph")` → 데이터 있으면 "이 기사 인물 관계도 (자동추출·검수 전 베타)" 섹션 + `<KgGraph>` 렌더. 노드 클릭 → `apiFetch("/api/admin/kg/person/<id>/ego")` → 노드/엣지 병합해 ego 표시. 401/빈 데이터/비관리자면 아무것도 렌더 안 함.
- **`article-client.tsx`**: `<ArticleGraph idxno={idxno} />`를 적절한 위치에 삽입(최소 변경). 인쇄 시 `no-print`.

## 10. 무결성·범위
- backend **질의 경로 무변경**(그래프 API는 조회 전용, 답변 미영향). 새 라우트·리포지토리만 추가.
- 관리자 전용이라 미검수 데이터 공개 위험 없음. 라벨로 명시.
- 데이터 없으면 섹션 미표시.

## 11. 테스트
- 순수 `rankNeighbors` TDD(backend vitest): 인접 필터·weight 정렬·상한·self 제외·중복 병합.
- 리포지토리/라우터: tsc + 회귀(기존 테스트 무손상) + 관리자 스모크(선택).
- 캔버스 컴포넌트·기사 섹션: web 빌드 + 수동 확인.

## 12. 성공 기준
- 관리자가 (추출 데이터 있는) 기사 상세에서 "이 기사 인물 관계도"를 보고, 인물 클릭 시 ego로 확장된다.
- 비관리자·데이터 없는 기사엔 섹션이 안 뜬다. AI 질의·기존 화면 회귀 없음. 라벨로 미검수 명시.

## 13. 후속
- 검수(4단계) 후 공개 전환, 전용 탐색 페이지, 엣지→근거 기사 목록, 조직·장소 다중 개체 그래프.
