# 태안 인사이트 — 인물 탐색(기자 취재 지원) v1 (설계 스펙)

작성일: 2026-07-27
상태: 설계 확정(브레인스토밍 완료, 사용자 승인) · 구현 계획 대기
선행: 인물 그래프(34,510인물·coappears 1,267,083엣지, 전부 verified=0)·관계 라벨(3,880)·관계도 UI·검수 콘솔 라이브. KG 로드맵 0~6 완료.

## 1. 목표
관리자/기자가 **인물을 검색**하면 그 사람의 **관계망·함께 등장 인물·나온 기사·시기별 추이·직위**를 한 화면에서 보는 **취재 지원 도구**를 `/admin/kg`에 추가한다. 10만 건 아카이브를 "인물" 축으로 탐색하는 진입점. 기자/편집인 바이라인은 자동 제외.

## 2. 배경
- KG는 관계도 UI(6단계)·검수 콘솔(4단계)·관계 라벨(5단계)까지 완성됐으나, 자동추출(verified=0)이라 **AI 답변엔 미반영**이고 관리자만 기사별 관계도를 볼 수 있었다. 인물을 **검색해 프로필로 훑는** 진입점이 없었다.
- 실용화는 "① 기자 취재 지원 → ② AI 질의 연결 → ③ 독자 공개"의 **단계적 로드맵**으로 합의. 본 스펙은 그 중 **①(v1)**. ②③은 이 데이터를 재활용해 이후 별도 스펙.
- 데이터: `kg_nodes`(person), `kg_mentions`(인물×기사, `node_id`·`article_idxno`), `kg_edges`(coappears, attrs `weight`·`reltype`), `archive_articles`(`idxno`·`title`·`published_at`), `kg_edges`(held → office, verified Fact).

## 3. 범위
### v1 (본 스펙)
- 인물 이름 검색 + 인물 프로필 5블록(관계망·함께등장·기사·직위·시기추이). 바이라인 자동 제외. `/admin/kg`에 "인물 탐색" 탭. 기존 admin-token 게이트. **추가 LLM/데이터 비용 0**(코드·D1 조회만).
### 비범위(이후)
- ② AI 질의 연결(verified 승격분 답변 주입), ③ 독자 공개 위젯, 바이라인 수동 태깅(자동 임계만), 인물 사진·외부 링크, 조직/사건 노드 프로필.

## 4. 결정 요약
| 항목 | 선택 |
|---|---|
| 1차 목표 | ① 기자 취재 지원(내부 도구) |
| 진입점 | 인물 이름 검색 → 등장 많은 순 후보 |
| 프로필 블록 | 관계망 · 함께등장 인물 · 나온 기사 · 직위·소속 · 시기별 추이 |
| 바이라인 제외 | 자동 임계 — 등장 기사 수 ≥ `HUB_MENTIONS`(=5000) |
| 데이터 | 자동추출(verified 무관, 내부 표시 전용) + 직위만 verified Fact |
| 위치·게이트 | `/admin/kg` 새 탭, 기존 admin-token |

## 5. 초허브(바이라인) 자동 제외
- **근거**: 상위 등장 분포 — 김동이 17,835·신문웅 12,312(기자/편집인 바이라인) vs 3위 가세로 3,451(군수). 만 단위 2명과 3천 단위 실인물 사이 3.5배 갭.
- **규칙**: 등장 기사 수 ≥ `HUB_MENTIONS`(상수, 기본 5000) 인 인물을 **바이라인**으로 보고 **관계망·함께등장에서 제외**. 임계값은 `people.ts` 한 곳의 상수(튜닝 포인트).
- 프로필 주인공 자신이 바이라인이어도 프로필은 보여준다(경고 배지 표시). 제외는 "그의 이웃/함께등장 목록"에만 적용.

## 6. 아키텍처(한 문장)
`backend/src/kg/people.ts`(순수 로직: `isHub`·`rankCoappears`·`yearHistogram`) + admin_router 엔드포인트 2개(`/persons/search`, `/person/:id/profile`; 관계망은 기존 `personEgo` 재사용). 프런트 `web/src/app/admin/kg/people-explorer.tsx`가 검색→프로필 5블록 렌더(관계망은 `kg-graph` 재사용). **query-path·AI 답변·기존 화면 무변경.**

## 7. 순수 로직 (`backend/src/kg/people.ts`, TDD)
- `HUB_MENTIONS = 5000` (상수).
- `isHub(mentions: number): boolean` — `mentions >= HUB_MENTIONS`.
- `rankCoappears(rows, hubIds, limit)`: `rows`=`{otherId, name, count}` 목록에서 `hubIds`에 든 상대를 제외하고 `count` 내림차순(동률 name)으로 `limit`개.
- `yearHistogram(rows)`: `rows`=`{year:number}` 목록 → `{year, count}` 오름차순 배열(연도 누락은 건너뜀, 빈 배열 허용).
- 전부 순수·부작용 없음. D1 접근 금지(호출부가 행을 넘김).

## 8. 엔드포인트 (admin_router, admin-token 게이트)
- `GET /api/admin/kg/persons/search?q=<name>&limit=20`
  - `SELECT n.id, n.name, (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) AS mentions FROM kg_nodes n WHERE n.type='person' AND n.name LIKE ? ESCAPE '\' ORDER BY mentions DESC LIMIT ?` (`%q%`, `q`의 `%_\`는 이스케이프). 응답 `{ results: [{id,name,mentions}] }`.
- `GET /api/admin/kg/person/:id/profile?limit=12`
  - **관계망**: `personEgo(db, id, limit)` 재사용(단, 바이라인 이웃 제외 — §9).
  - **함께등장**: 인접 coappears에서 상대 인물 `weight` 합/최대 → `rankCoappears`(바이라인 제외) 상위 12. 응답 `coappear: [{id,name,count}]`.
  - **나온 기사**: `SELECT a.idxno, a.title, a.published_at FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno WHERE m.node_id=? ORDER BY a.published_at DESC LIMIT 30`. 응답 `articles: [{idxno,title,published_at}]`.
  - **직위·소속**: `SELECT dst_id, attrs_json FROM kg_edges WHERE src_id=? AND rel='held' AND verified=1` → office 이름·start·end·ordinal. 응답 `offices: [{office,start,end,ordinal}]`(없으면 `[]`).
  - **시기별 추이**: `SELECT CAST(strftime('%Y', a.published_at) AS INTEGER) AS year, COUNT(*) AS count FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno WHERE m.node_id=? AND a.published_at IS NOT NULL GROUP BY year ORDER BY year` → `yearHistogram` 정규화. 응답 `timeline: [{year,count}]`.
  - 통합 응답 `{ person:{id,name,mentions,isHub}, graph:{center,nodes,edges}, coappear, articles, offices, timeline }`. 인물 없으면 404.

## 9. 관계망·함께등장 바이라인 제외 (구현 방식 확정)
- 취재 화면 관계망·함께등장 목록에 바이라인이 뜨면 안 된다.
- **방식**: 바이라인 id 집합을 **1회 조회**한다 — `SELECT n.id FROM kg_nodes n WHERE n.type='person' AND (SELECT COUNT(*) FROM kg_mentions m WHERE m.node_id=n.id) >= 5000`. 결과는 소수(현재 김동이·신문웅 2명)이므로 `Set`으로 들고, **랭킹 전에 endpoint가 이 집합에 속한 coappears 엣지를 제외**한다(관계망·함께등장 모두). D1 100-파라미터 문제 없음(집합이 작음).
- **personEgo에 `excludeHubs?: Set<string>` 옵션 추가**: 기본 미지정 → 기존 동작 그대로. profile 경로에서만 바이라인 집합을 넘겨 제외. **기사 상세의 `articlePersonGraph`·기존 `/person/:id/ego` 엔드포인트는 옵션을 넘기지 않으므로 동작 무변경.**

## 10. 프런트 (`web/src/`)
- `lib/api/kg.ts`: `searchPersons(q)`, `getPersonProfile(id)` 추가(기존 admin-token 헤더 규약 재사용).
- `app/admin/kg/people-explorer.tsx`: 검색 인풋 + 후보 목록 + 선택 시 5블록. 관계망은 `@/components/kg-graph` 재사용(인물 클릭 시 그 인물 프로필로 이동). 시기별 추이는 간단한 인라인 막대(외부 차트 라이브러리 금지 — kg-graph처럼 자체 렌더).
- `app/admin/kg/page.tsx`: 기존 "노드 목록"·"검수" 탭 옆에 **"인물 탐색"** 탭 추가. 게이트·로그인 UI 그대로.

## 11. 무결성·범위
- 자동추출(관계·함께등장·기사·추이)은 **내부 관리자 도구 표시 전용** — 검수(4단계)·AI 답변(②)과 무관, `verified` 불변. 직위·소속만 `verified=1` Fact.
- **query-path·AI 답변·기존 화면(기사 상세 관계도 포함) 무변경.** admin-token 이중 게이트(서버 401 + 클라 토큰).
- 스키마 변경 없음(기존 테이블 조회만). 신규 마이그레이션 없음.

## 12. 테스트
- 순수 TDD(`backend/tests/kg_people.test.ts`): `isHub`(임계 경계), `rankCoappears`(바이라인 제외·정렬·limit·빈입력), `yearHistogram`(정렬·누락연도 skip·빈배열).
- 얇은 D1(검색/프로필 쿼리)·라우터·UI는 `tsc --noEmit` + 빌드 + 수동 스모크.

## 13. 성공 기준
- `/admin/kg` "인물 탐색"에서 "가세로" 검색 → 프로필에 관계망·함께등장(김동이·신문웅 등 바이라인 **미표시**)·최신 기사·연도별 추이가 뜬다. 직위는 verified Fact 있으면 표시.
- 함께등장·관계망에 바이라인 2명이 나오지 않는다. AI 답변·기존 화면 회귀 없음.

## 14. 후속
- ② verified 승격분 AI 질의 연결, ③ 독자 공개 위젯, 바이라인 수동 태깅·자동 임계 튜닝, 조직/사건 프로필.
