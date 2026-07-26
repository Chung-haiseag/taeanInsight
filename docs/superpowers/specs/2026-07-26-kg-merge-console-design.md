# 태안 인사이트 — 4단계 v1: 동명이인 병합 검수 콘솔 (설계 스펙)

작성일: 2026-07-26
상태: 설계 확정(브레인스토밍 완료, 사용자 승인) · 구현 계획 대기
선행: KG substrate·전 코퍼스 인물 그래프(34,510 인물·127만 엣지, 전부 verified=0) 라이브. 관계도 UI(6단계) 관리자 배포됨.

## 1. 목표
자동추출 인물의 **동명이인·표기변형(김동이/김동위)** 을 관리자가 검수해 병합한다. 로컬 스크립트가 병합 후보를 미리 계산하고, 관리자가 `/admin/kg` 검수 탭에서 **병합/유지/보류** 판정. 병합은 **soft**(`canonical_id`만 세팅) — 127만 엣지를 재작성하지 않고, 관계도 조회 때 대표로 해소·합침. 되돌리기·audit 지원.

## 2. 배경
- 데이터: `kg_nodes`(34,510 person, verified=0, **aliases 컬럼 존재**), `kg_mentions`(227,095), `kg_edges`(coappears 1,267,083). 병합용 필드 없음.
- 실제 문제: 김동이/김동위 표기변형, 그리고 초허브(김동이·신문웅 기자/편집인 — v1 비범위).
- 관리자 인프라: `/api/admin/kg/*`(adminGuard), 웹 `/admin/kg`(KgLogin + KgConsole 노드목록). 순수로직 관례 `backend/tests/*.test.ts`.

## 3. 범위
### v1
- 동명이인 병합: 후보 탐지(로컬 스크립트) + 검수 큐 API + soft 병합(canonical_id) + 관계도 조회 해소 + 웹 검수 탭 + 되돌리기/audit.
### 비범위(이후)
- 초허브 역할 태깅, 노드 분리(split), 별칭 수동관리, LLM 기반 후보, 공개 전환. verified 데이터 승격.

## 4. 결정 요약
| 항목 | 선택 |
|---|---|
| v1 초점 | 동명이인 병합 |
| 저장 | soft(`canonical_id`) + 질의 시 해소 |
| 후보 탐지 | 로컬 스크립트, 결정론(블로킹+편집거리≤1), 무료 |
| 병합 대표 | 등장(mention) 많은 쪽 자동 |

## 5. 데이터 모델 (`db/migrations/035_kg_merge.sql`)
```sql
ALTER TABLE kg_nodes ADD COLUMN canonical_id TEXT;   -- NULL=자기가 대표
CREATE INDEX IF NOT EXISTS idx_kg_nodes_canonical ON kg_nodes(canonical_id);

CREATE TABLE IF NOT EXISTS kg_merge_candidates (
  a_id TEXT NOT NULL, b_id TEXT NOT NULL,   -- a_id < b_id 정렬쌍
  reason TEXT, score REAL,
  a_men INTEGER, b_men INTEGER,             -- 각 등장수(근거·대표 선택용)
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|merged|kept|deferred
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (a_id, b_id)
);
CREATE INDEX IF NOT EXISTS idx_merge_cand_status ON kg_merge_candidates(status);

CREATE TABLE IF NOT EXISTS kg_merge_log (
  id TEXT PRIMARY KEY, merged_id TEXT NOT NULL, canonical_id TEXT,
  action TEXT NOT NULL,                     -- merge|unmerge|keep
  actor TEXT, created_at TEXT NOT NULL
);
```

## 6. 후보 탐지 — 로컬 스크립트 (`tools/kg/merge-candidates.mjs`)
- kg_nodes(type=person)에서 `id,name` + 각 mention 수 조회.
- **블로킹**: `blockKey(name)` = 길이 + 첫 글자로 그룹핑(34,510 전량 비교 방지).
- 그룹 내 쌍 중 **편집거리 ≤ 1**(김동이↔김동위)이면 후보. reason='edit1', score=유사도.
- `a_id<b_id` 정렬쌍으로 `kg_merge_candidates` upsert(status 유지). D1 쓰기는 ebook 배치 패턴.
- 순수 로직(`editDistance`, `blockKey`, `genCandidates`)은 `tools/kg/merge-lib.mjs`에 분리해 TDD.

## 7. 백엔드 API (관리자 가드, `admin_router.ts` 확장)
- `GET /merge/candidates?limit=` → pending 후보(등장 많은 쪽 우선 정렬) + 이름·등장수·reason.
- `POST /merge` `{ merged_id, canonical_id }` → `kg_nodes.canonical_id=canonical_id` 세팅(자기참조·순환 금지 검증) + `kg_merge_log(merge)` + 후보 status=merged.
- `POST /merge/keep` `{ a_id, b_id }` → 후보 status=kept(다른 사람 — 다시 안 뜸).
- `POST /merge/unmerge` `{ merged_id }` → canonical_id=NULL + log(unmerge) + 관련 후보 status=pending 복원.

## 8. 관계도 조회 해소 (`backend/src/kg/merge.ts` + graph.ts)
- 순수 `resolveCanonical(nodes, edges, map)`: map(merged→canonical)로 노드/엣지 id 치환 → **중복 노드 병합(등장수 합)·중복 엣지 병합(weight 합)**·self 엣지 제거. **TDD.**
- 얇은 `loadCanonicalMap(db)`: `SELECT id, canonical_id FROM kg_nodes WHERE canonical_id IS NOT NULL`.
- `articlePersonGraph`·`personEgo`가 결과에 resolveCanonical 적용, `listNodes`는 canonical만 표시(병합된 건 숨김/대표로).
- **query-path 무변경**: verified=0 그래프 조회에만 영향, AI 답변·기존 라우트 무변경.

## 9. 웹 검수 콘솔 (`/admin/kg` 검수 탭/섹션)
- 후보 큐 카드: **A(등장 n) vs B(등장 m)** + reason(1글자 차) → **[병합] [다른 사람] [보류]**. 병합 시 대표=등장 많은 쪽 기본(관리자 확인). 처리 후 다음 후보. 되돌리기 목록(최근 병합) + unmerge 버튼.
- apiFetch(X-Admin-Token 자동) 재사용. 관리자만.

## 10. 무결성·범위
- **되돌리기 가능**(canonical_id=NULL) + **audit(kg_merge_log)**. soft라 파괴적 재작성 없음.
- 병합 판정은 **사람이**(실제 동일인만) — 후보 탐지는 기계, 확정은 관리자(지어내기 방지 연장).
- 자동추출 verified=0 → **AI 답변 무영향**. 병합도 그래프 조회에만.
- 순환/자기참조 canonical 금지(검증).

## 11. 테스트
- 순수 TDD: `editDistance`(≤1 판정), `blockKey`, `genCandidates`(블록 내 편집거리≤1 쌍·정렬쌍), `resolveCanonical`(치환·중복노드 등장수합·중복엣지 weight합·self 제거).
- 얇은 D1·라우터·스크립트·UI는 tsc/`node --check`/빌드/스모크.

## 12. 성공 기준
- 스크립트가 김동이/김동위류 후보를 큐에 올리고, 관리자가 검수 탭에서 병합하면 그 인물의 관계도가 **대표로 합쳐져** 보인다. 되돌리기 동작. AI 답변·기존 화면 회귀 없음.

## 13. 후속
- 초허브 역할 태깅(그래프 억제), split, LLM 후보 보강, 검수된 그래프 공개 전환.
