# 태안 인사이트 — 3단계: 인물 추출 → 공동등장 그래프 (설계 스펙)

작성일: 2026-07-25
상태: 설계 확정(브레인스토밍 완료, 사용자 "그냥 진행") · 구현 계획 대기
선행: v1 온톨로지+군수 계보 KG(라이브). 이 작업은 KG substrate를 **자동 추출 데이터로 채운다.**

## 1. 목표
로컬 배치로 Gemini Flash-Lite를 써서 `archive_articles` 본문에서 **인물명을 추출**하고, `kg_mentions`(인물×기사)에 근거를 적재한 뒤 **공동등장 엣지**를 파생 생성한다. 결과는 관계도 UI·탐색·4단계 검수의 입력이 되며, **AI 답변엔 주입하지 않는다**(지어내기 방지 유지).

## 2. 배경
- KG substrate 라이브: `kg_ontology`(런타임 편집)·`kg_nodes`·`kg_edges`(migration 033). person/office 타입, held 관계.
- `archive_articles`(migration 006): idxno PK, title, body(전문, `members_only=1`이면 비어있음), year, published_at. 2002~ + 디지털화 1990–2001(idxno 90000001~90099999).
- 검증된 대량 추출 패턴: `tools/ebook/*.mjs` — 로컬 Node + Gemini(GEMINI_API_KEY 터미널), 동시성·체크포인트·충실도(한글 n-gram 겹침)·JSONL→D1 적용.

## 3. 범위
### 이번(3단계)
- **인물만** 추출. `kg_mentions` 테이블 + `coappears` 관계(온톨로지 추가). 로컬 추출 스크립트 + 파생 집계.
### 비범위(이후)
- 조직·장소·사건·정책 추출(온톨로지 타입 추가로 확장), 관계 라벨링(5), 검수 콘솔(4), 관계도 UI(6). AI 답변 주입(자동추출은 영원히 verified=0로 미주입; 검수 승격은 4단계).

## 4. 결정 요약
| 항목 | 선택 |
|---|---|
| 추출 실행 | 로컬 배치 + Gemini Flash-Lite(thinking off) |
| 근거 모델 | `kg_mentions` 테이블 + 파생 `coappears` 엣지 |
| 추출 범위 | 인물만(조직·장소 이후) |
| 자동추출 검증 | **verified=0** → AI 답변 미주입(그래프·UI 전용) |
| 잡음 | 저빈도 인물도 보관, 필터는 조회·UI(6단계) |
| 노드 식별 | 정확 이름 키잉, 동명이인 분리는 4단계 |

## 5. 아키텍처(한 문장)
`tools/kg/extract-persons.mjs`가 본문→Gemini로 인물명 추출→충실도 필터→JSONL, 이어 `apply`가 `kg_nodes`(person, verified=0)·`kg_mentions` 적재→`derive`가 공유 기사쌍 집계로 `kg_edges`(coappears) 생성. 온톨로지에 coappears 추가.

## 6. 온톨로지 확장 (additive)
- 관계 `coappears`(공동등장): `spec_json={"src":"person","dst":"person","attrs":["weight"]}`. person 타입은 기존. kg_ontology에 INSERT(코드/DB 마이그레이션 불필요한 additive; 여기선 migration 034로 시드).

## 7. 데이터 모델 (`db/migrations/034_kg_mentions.sql`)
```sql
CREATE TABLE IF NOT EXISTS kg_mentions (
  node_id TEXT NOT NULL,           -- 'person:<정규화이름>'
  article_idxno INTEGER NOT NULL,  -- archive_articles.idxno
  schema_ver INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (node_id, article_idxno)
);
CREATE INDEX IF NOT EXISTS idx_kg_mentions_article ON kg_mentions(article_idxno);

INSERT OR IGNORE INTO kg_ontology(kind,name,label,spec_json,schema_ver,updated_at) VALUES
 ('relation','coappears','공동등장','{"src":"person","dst":"person","attrs":["weight"]}',1,'2026-07-25T00:00:00Z');
```
- 공동등장 엣지는 기존 `kg_edges` 재사용: id `coappears:<idA>|<idB>`(정렬쌍), rel=`coappears`, attrs_json `{weight, articles:[대표 idxno]}`, verified=0, source="아카이브 추출".

## 8. 추출 스크립트 (`tools/kg/`, ebook 패턴)
`extract-persons.mjs`:
- **대상**: `archive_articles` WHERE `body IS NOT NULL AND trim(body)<>''`. 연도 인자 + `--limit`/`--conc`(백필 파라미터화). 체크포인트 파일(처리한 idxno)로 재실행 스킵.
- **추출**: 기사 본문 → Gemini(모델 env `GEMINI_MODEL` 기본 `gemini-2.5-flash-lite`, `thinkingConfig.thinkingBudget:0`) → **인물명 배열(JSON)만** 반환하는 프롬프트(직함 제외한 실명).
- **충실도 가드**: 추출 이름이 본문에 실제로 있는지 정규화 후 확인 → 없으면 버림(지어내기 방지).
- **재시도**: fetch failed/429/5xx 지수 백오프. 단일 기사 실패는 격리하고 계속.
- **출력**: `out/kg_mentions.jsonl`(idxno, names[]).

`apply-mentions.mjs`(또는 동일 스크립트 단계): JSONL → `kg_nodes`(person, verified=0) upsert + `kg_mentions` upsert. ebook의 D1 쓰기 방식(wrangler d1 execute --file 배치) 재사용. **원격 적용은 사용자 승인 후.**

`derive-coappears.mjs`: `kg_mentions`에서 같은 article_idxno 공유쌍 집계 → `kg_edges`(coappears) upsert(멱등). 증분 재실행 시 재집계.

## 9. 노드 식별·잡음
- `normalizeName(raw)`: trim + 내부 공백 1개로 축약 + 양끝 비한글/비영숫자 제거. 직함 접미(군수·의원·대표·씨 등)는 프롬프트에서 배제(스크립트는 최소 정규화).
- `personNodeId(name)` = `person:` + normalizeName. **동명이인·표기변형 병합됨** → 4단계 검수에서 분리.
- 저빈도 인물 보관(mentions 저렴). 필터는 6단계 UI/조회에서 degree·등장수로.

## 10. 무결성·에러 처리
- **verified=0 → AI 답변 미주입**: 질의 경로(`getGunsuLineage` 등)는 verified=1만 사용. coappears/자동 person은 답변에 안 나옴. 그래프·UI·검수 입력 전용.
- **충실도 가드**로 본문에 없는 이름 배제(지어내기 방지).
- **증분·체크포인트·재시도·단일실패 격리**(전역 안정성 패턴).
- **멱등**: 노드/mentions/엣지 upsert. 재실행 안전.
- 원격 D1 적용은 **사용자 승인 후**.

## 11. 비용·롤아웃
- Gemini Flash-Lite thinking off·증분으로 저가. 실제 백필 범위(**파일럿 연도 먼저 vs 전체**)는 롤아웃 때 스크립트 인자로 결정.
- 흐름: 034 마이그레이션 → 파일럿 연도 추출·적재·파생 → 그래프 스팟체크 → 필요시 전체 확대.

## 12. 테스트 (순수 로직 TDD, 기존 backend vitest 재사용)
순수 로직은 **`tools/kg/lib.mjs`(ESM 단일 소스)** 에 두고, tools 스크립트가 런타임 import한다. 테스트는 기존 backend vitest(node env)로: **`backend/tests/kg_extract.test.ts`가 `../../tools/kg/lib.mjs`를 import**해 검증(중복 없음, `include: tests/**/*.test.ts`에 포함됨). 대상 순수 함수:
1. `normalizeName(raw)`: 공백 축약·양끝 문장부호 제거, 빈 입력 처리.
2. `faithfulFilter(names, body)`: 본문(정규화)에 실제로 있는 이름만 남김, 없는 이름 제거.
3. `personNodeId(name)`: 정규화 이름 → `person:<name>`.
4. `deriveCoappears(articleToNodeIds)`: 공유쌍·가중치 집계(정렬쌍 id, self 제외, 대칭 1회, weight=공유 기사 수).
5. `pairEdgeId(idA, idB)`: 정렬쌍 → `coappears:<min>|<max>`(대칭 일관).

## 13. 성공 기준
- 파일럿 연도 기사에서 인물이 `kg_nodes`(verified=0)+`kg_mentions`에 적재되고, `coappears` 엣지가 공유 기사 가중치로 생성된다.
- 본문에 없는 이름 0(충실도), 재실행 멱등, 단일 기사 실패가 전체를 안 죽인다.
- **AI 질의 응답은 이 데이터로 바뀌지 않는다**(verified=0 미주입) — 회귀 없음.

## 14. 후속
- 조직·장소·사건 타입 추가(추출 프롬프트 확장) → 5단계 관계 라벨링 → 4단계 검수 콘솔(동명이인 분리) → 6단계 관계도 UI(근거 기사 연결).
