# 온톨로지 확장 Phase 1 — 장소·품목 설계

**목표:** 태안 지식그래프에 **장소(place)·품목(commodity)** 개체와 **취급(handles)** 관계를 추가해, 아카이브(인물·직위)와 실시간 데이터(위판·시세·예측)를 하나의 온톨로지로 잇는 첫걸음. "안흥위판장(장소) —취급→ 꽃게(품목) —시세→ 실시간 경락가"가 성립.

**범위:** Phase 1은 **장소 + 품목 + 취급 관계**만. 조직·사건·정책 개체와 소속/주관/추진 관계, 액션 층은 Phase 2/3(본 문서 범위 밖).

**원칙(기존 유지):**
- **데이터 주도 온톨로지** — `kg_ontology` 테이블에 type/relation 행 추가. 스키마(테이블) 변경 없음.
- **출처 필수 + verified=1** — 큐레이션 시드는 모두 `source` 명시, 검수 완료(사실층)로 저장. 지어내기 방지.
- **도메인·레인지 검증** — `handles`는 place→commodity만 허용(`isValidEdge`).

## 온톨로지 추가 (kg_ontology)

| kind | name | label | spec |
|---|---|---|---|
| type | `place` | 장소 | — |
| type | `commodity` | 품목 | — |
| relation | `handles` | 취급 | `{"src":"place","dst":"commodity","attrs":["season"]}` |

## 개체 시드 (kg_nodes, verified=1)

**장소(place)** — 실데이터에 이미 있는 지점을 노드화:
- 위판장 5: 안흥·모항·채석포(서산수협), 백사장·영목(안면도수협) — 출처: 해수부 위판/수협
- 해수욕장 5: 만리포·꽃지·몽산포·신두리·백사장 — 출처: 국립해양조사원 해수욕장
- 관광지 4: 천리포수목원·코리아플라워파크·안면도·태안해안국립공원 — 출처: 태안군 관광

**품목(commodity)** — 실시간 데이터와 연결(attrs.live = 연결 소스, attrs.dataKey = 키):
- 수산 11: 꽃게·바지락·우럭·전복·낙지·꼬막·새우·오징어·갈치·대하·주꾸미 — attrs `{live:"seafood/auction/seasonal", dataKey}`
- 농산 5: 마늘·생강·감자·고추·양파 — attrs `{live:"agri"}`

> **디지털 트윈 브릿지**: 품목 노드의 `attrs.live/dataKey`가 실시간 시세·위판추세·제철 데이터를 가리켜, 온톨로지 객체 "꽃게"가 곧 그 라이브 값과 연결됨.

## 관계 시드 (kg_edges, rel=handles, verified=1)
위판장 → 취급 품목(태안 위판 실적 근거):
- 안흥 → 꽃게·우럭·오징어·갈치·대하·주꾸미·낙지
- 모항 → 꽃게·우럭·대하
- 채석포 → 우럭·오징어
- 백사장·영목 → 대하·바지락·오징어

## 표면(surface)
- **/data 지식그래프 섹션 자동 반영** — 이미 `kg_ontology`를 읽어 개체·관계를 표시하므로, 시드 후 **장소·품목 개체 + 취급 관계 + 개체별 노드 수**가 자동 노출.
- `loadKgStats`에 **개체별 노드 수(typeCounts)** 추가 → "인물 34K · 직위 1 · 장소 14 · 품목 16".

## 구현 순서
1. `db/migrations/049_kg_phase1.sql` — 온톨로지(place·commodity·handles) + place/commodity 노드 + handles 엣지(INSERT OR IGNORE, verified=1, source). 원격 D1 적용.
2. `backend/src/kg/public_stats.ts` — `loadKgStats`에 개체별 노드 수(typeCounts) 추가.
3. `web` — /data 지식그래프 섹션에 개체별 카운트 표시.
4. 검증: kg_ontology 4type/3relation, 노드/엣지 수 증가, /data 반영.

## 검증(테스트) 포인트
- 시드 멱등(재적용 시 중복 없음).
- handles 엣지가 온톨로지 위반 없이(place→commodity) 적재.
- /kg-stats가 새 타입·관계·카운트 반환.

## 범위 밖(다음 단계)
- Phase 2: 조직·사건·정책 개체 + 소속/주관/추진/관련 관계(아카이브·군청공지 추출·검수).
- Phase 3: 액션 층(취재 배정·알림) + AI 질의에 새 개체 근거 연결.
