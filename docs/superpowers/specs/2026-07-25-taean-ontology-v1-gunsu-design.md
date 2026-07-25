# 태안 인사이트 — v1 온톨로지 + 군수 계보 Fact 레이어 (설계 스펙)

작성일: 2026-07-25
상태: 설계 확정(브레인스토밍 완료) · 구현 계획 대기

## 1. 목표
"역대/현직/N대 태안군수" 같은 **열거·사실형 질의**에, **검증된 구조 데이터**로 정확히·출처와 함께 답한다.
동시에 이후 지식그래프(인물·개체·관계) 확장의 **범용 기반(substrate)** 을 깔고, **납품 후(Day-2)에도 코드/DB 마이그레이션 없이 확장**되게 만든다.

## 2. 배경 — 현재 상태(v0)
- 이미 `facts` 테이블(마이그레이션 032) + `backend/src/query/facts.ts` 존재. 다만 **평면(flat) 구조**: `keywords`(공백 구분) 매칭으로 자유텍스트 블롭 주입. 구조화·질의·확장이 안 됨.
- v1은 제로 시작이 아니라 **v0(평면) → v1(구조화 KG)** 업그레이드. v0 `facts`는 **폴백 근거원으로 공존**(제거하지 않음).
- 마이그레이션: `db/migrations/NNN_*.sql`, 다음 번호 **033**. 적용: `npx wrangler d1 execute taean-archive --remote --file db/migrations/033_kg.sql`.
- RAG 파이프라인: `backend/src/query/router.ts`(근거 조립·주입 지점). 관리자 인증: `backend/src/auth/admin_router.ts` + `ADMIN_TOKEN`.

## 3. 범위
### v1 (이번)
- 군수 계보 하나만: **인물 → 직위(태안군수) → 역임(기간·N대)**.
- 범용 KG 테이블 + **D1 온톨로지 레지스트리** + 키워드 의도 게이트 + 질의 통합 + **최소 관리자 폼**(입력·검증).
### 비범위 (후속)
- 기사에서 개체·관계 자동추출, 기사 개체 관계도, 인물 공동등장 그래프, 검수 콘솔 전체 기능, 인구·군의원 도메인(파이프라인 검증 후 곧바로 추가).

## 4. 결정 요약
| 항목 | 선택 |
|---|---|
| 시범 범위 | 군수 계보 하나 |
| 데이터 확보 | 사용자 확인 우선(출처+검증플래그, 지어내기 금지) |
| 기반 | 범용 KG(kg_nodes/kg_edges) + 버전 온톨로지 |
| 온톨로지 config 위치 | **D1 테이블**(런타임 편집 가능) |
| 의도 게이트 | **키워드 규칙**(무료·결정론적) |
| 입력 방식 | **최소 관리자 폼**(upsert/verify) + 멱등 임포트 |
| v0 facts | 폴백으로 공존 |

## 5. 아키텍처(한 문장)
D1 **온톨로지 레지스트리(kg_ontology)** 가 허용 타입/관계를 통제하고, **범용 노드/엣지(kg_nodes/kg_edges)** 에 검증된 군수 계보를 담는다. RAG 질의에 **키워드 의도 게이트 → 결정론적 KG 조회 → 출처 붙은 authoritative 근거 블록 최우선 주입**을 추가한다. 입력·검증은 **관리자 폼**으로, 미검증·출처없음 데이터는 답변에서 제외한다.

## 6. 데이터 모델 (`db/migrations/033_kg.sql`)

```sql
-- 온톨로지(스키마) 레지스트리 — 런타임 편집. 허용 타입/관계/속성 정의.
CREATE TABLE IF NOT EXISTS kg_ontology (
  kind TEXT NOT NULL,          -- 'type' | 'relation'
  name TEXT NOT NULL,          -- 예: 'person','office' / 'held','predecessor'
  label TEXT NOT NULL,         -- 표시명(예: '인물','직위','역임')
  spec_json TEXT,              -- 관계: {"src":"person","dst":"office","attrs":["start","end","ordinal"]}
  schema_ver INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, name)
);

-- 개체(노드)
CREATE TABLE IF NOT EXISTS kg_nodes (
  id TEXT PRIMARY KEY,         -- 슬러그(예: 'person:kang-taesan', 'office:taean-gunsu')
  type TEXT NOT NULL,          -- kg_ontology(kind='type') 대조(앱 검증)
  name TEXT NOT NULL,          -- 대표명(정규화)
  attrs_json TEXT,             -- 타입별 속성(JSON)
  aliases TEXT,                -- 별칭·표기변형(공백 구분) — 동명이인/매칭용
  source TEXT,                 -- 출처(verified=1이려면 필수)
  verified INTEGER NOT NULL DEFAULT 0,
  schema_ver INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON kg_nodes(type);

-- 관계(엣지)
CREATE TABLE IF NOT EXISTS kg_edges (
  id TEXT PRIMARY KEY,         -- 슬러그/uuid
  src_id TEXT NOT NULL,
  rel TEXT NOT NULL,           -- kg_ontology(kind='relation') 대조
  dst_id TEXT NOT NULL,
  attrs_json TEXT,             -- 관계 속성(예: 역임 {"start":"2010-07-01","end":"2018-06-30","ordinal":45})
  source TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  schema_ver INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kg_edges_src ON kg_edges(src_id, rel);
CREATE INDEX IF NOT EXISTS idx_kg_edges_dst ON kg_edges(dst_id, rel);
```

## 7. 온톨로지 v1 정의 (kg_ontology 시드)
- **타입**: `person`(인물), `office`(직위)
- **관계**: `held`(역임) `spec_json={"src":"person","dst":"office","attrs":["start","end","ordinal"]}`
  - (선택) `predecessor`(전임) `{"src":"person","dst":"person"}` — v1은 저장하지 않고 `ordinal`로 파생. 필요 시만 사용.
- **군수 계보 표현**:
  - 직위 노드 1개: `office:taean-gunsu` (name="태안군수")
  - 인물 노드 N개: 군수별 1개
  - 엣지: 인물 —`held`→ `office:taean-gunsu`, attrs `{start,end,ordinal}`
  - "역대 군수" = `held` 엣지(dst=office:taean-gunsu)를 `ordinal`/`start`순 정렬
  - "현직 군수" = `held` 엣지 중 `end` 없음/미래

## 8. 구성요소 (파일별 책임)
| 파일 | 책임 |
|---|---|
| `db/migrations/033_kg.sql` | 위 3개 테이블 + 인덱스 |
| `backend/src/kg/ontology.ts` | kg_ontology 로드(캐시) · 타입/관계 검증(모르는 값 거부) · 관계 spec 조회 |
| `backend/src/kg/repository.ts` | 노드/엣지 CRUD(검증 경유) · `getGunsuLineage()`(held·verified·기간순) · 별칭 정규화 훅 |
| `backend/src/kg/import.ts` | `gunsu.json`(사용자 검증값) 멱등 임포트 · **source 없으면 거부** |
| `backend/src/query/kg_facts.ts` | 키워드 의도 게이트 · KG 조회 · authoritative 근거 블록 생성(출처 포함) |
| `backend/src/query/router.ts`(수정) | 의도 게이트 발동 시 KG 블록을 **최우선 근거로 주입**(기존 RAG·v0 facts 앞) |
| `backend/src/kg/admin_router.ts` | 인증(ADMIN_TOKEN) upsert/verify/list 엔드포인트 + 온톨로지 관리(Day-2) |
| `web/src/app/admin/kg/*`(신규) | 최소 관리자 폼(노드/엣지 목록·추가·검증 토글) — 검수 콘솔의 씨앗 |

## 9. 데이터 흐름
```
[입력] 관리자 폼/gunsu.json → (검증: type·source) → kg_nodes/kg_edges (verified 지정)
[질의] "역대 태안군수?" → 키워드 게이트 감지
   → repository.getGunsuLineage() (verified=1만, ordinal순)
   → kg_facts: 출처 붙은 authoritative 블록 생성
   → router: 최우선 근거로 주입 → LLM이 인용해 답 → 응답 sources에 출처 표기
```

## 10. 질의 통합 — 의도 게이트(키워드 규칙)
- 발동 조건: 질의에 `군수`(또는 `태안군수`) **그리고** {`역대`,`역임`,`지낸`,`전임`,`후임`,`현직`,`현재`,`누가`,`누구`,`명단`,`목록`, 정규식 `\d+\s*대`} 중 하나.
- 발동 시: 계보 조회 → 블록 예시
  ```
  [검증된 사실 · 출처: 태안군청 연혁]
  태안군수 계보: N대 ○○○(2010.7~2018.6), N+1대 ○○○(2018.7~ 현재) …
  ```
- **verified=1 데이터만** 포함. 하나도 없으면 블록 생성하지 않고 기존 RAG로 진행(fail-open).
- 응답 `sources`: 해당 fact의 `source`를 출처로 노출(현행 url:null 공식근거와 동일 취급).

## 11. 무결성·에러 처리 (지어내기 방지 — 핵심)
- **출처 강제**: `verified=1`은 `source` 필수. 임포터/엔드포인트가 위반 시 거부.
- **미검증 숨김**: 답변 주입은 `verified=1`만.
- **온톨로지 검증**: 쓰기 시 kg_ontology에 없는 `type`/`rel` 거부.
- **엣지 무결성**: `src_id`/`dst_id` 존재 확인, 관계 spec의 src/dst 타입 일치 확인.
- **fail-open**: KG 경로 오류 시 기존 RAG로 폴백(질의 안 깨짐).
- **additive 안전**: 모든 행에 `schema_ver` 스탬프. 파괴적 변경(이름변경·병합·삭제)은 마이그레이션+**사용자 승인 후**.
- 데이터는 절대 모델이 생성하지 않음 — 사용자 확인값만.

## 12. 관리자 폼 (최소)
- 백엔드(Hono, ADMIN_TOKEN):
  - `GET /admin/kg/nodes?type=` · `POST /admin/kg/nodes`(upsert) · `POST /admin/kg/edges`(upsert) · `POST /admin/kg/verify`(플래그) · `GET/POST /admin/kg/ontology`(타입·관계 관리)
- 프론트(Next.js, 인증 게이트): `/admin/kg` — 노드/엣지 표 + 추가/수정 폼 + 검증 토글. 일반 사용자 비노출.
- 이 폼이 Day-2 비개발자 입력 경로 + 향후 **검수 콘솔**의 출발점.

## 13. Day-2 확장/운영 (납품 후)
- **타입/관계 추가**: 관리자 폼에서 kg_ontology에 행 추가 → 즉시 해당 타입 노드/엣지 허용. (코드·DB 마이그레이션 불필요)
- **새 군수 추가**: 인물 노드 + `held` 엣지 추가 후 검증.
- **파괴적 변경**: 마이그레이션 스크립트 + 승인 + 백업.
- **RUNBOOK**에 "온톨로지 추가/검증/파괴적 변경 절차" 섹션 명문화.

## 14. 테스트 (TDD)
1. 온톨로지: 미등록 type/rel 거부, 등록 값 허용.
2. 관계 무결성: held의 src=person/dst=office 아니면 거부.
3. 리포지토리 `getGunsuLineage`: ordinal순 정렬, **verified=1만** 반환.
4. 의도 게이트: "역대 군수" 발동 / "군수 관사 위치"·무관 질의 미발동(오발동 방지).
5. 임포터: 멱등(재실행 중복 없음), **source 없으면 거부**.
6. 근거 블록: verified 없으면 블록 미생성(폴백), 있으면 출처 포함 블록.
7. 관리자 엔드포인트: 미인증 거부, upsert/verify 동작.

## 15. 성공 기준
- "역대/현재/N대 태안군수" 질의가 **검증된 구조 데이터로 정확히·출처와 함께** 응답.
- 새 군수/타입 추가가 **관리자 폼(데이터+온톨로지)** 으로만 되고 코드/DB 마이그레이션 불필요(additive).
- **지어낸 값 0** — 미검증·출처없음은 답변에 안 나옴.
- KG 경로 실패해도 기존 질의 정상.

## 16. 롤아웃
1. 033 마이그레이션 로컬→원격 적용. 2. 온톨로지 v1 시드. 3. 관리자 폼으로 사용자 검증 군수 데이터 입력. 4. 스모크 테스트(대표 질의 5종). 5. RUNBOOK §5 기능 로그 한 줄. 배포는 **사용자 승인 후**.

## 17. 미해결/후속
- 인구(자동 API 시계열)·군의원(현직 로스터) 도메인 — v1 검증 후 추가.
- 기사 개체 추출→관계 라벨링→검수 콘솔 확장→관계도 UI(로드맵 3~6단계).
