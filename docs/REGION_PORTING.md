# 다른 지역(신문사) 적용 가이드 — Region Porting Guide

이 플랫폼을 **다른 지역 신문사**에 재적용할 때 바꿔야 할 **지역 고유값**과 **필요한 키/활용신청**을 한 곳에 정리한다.
목표: 새 지역 = 아래 표의 값만 교체 + 키 발급/활용신청. 데이터 소스 재조사 불필요.

> 데이터 소스 상세(엔드포인트·파라미터·에러의미)는 메모 `reference_marine_data_khoa.md` 참조.
> 기능 단위 이력은 `RUNBOOK.md §5 기능 로그`.

---

## 1. 지역 고유 상수 — "여기만 바꾸면 됨"

| 항목 | 현재값(태안) | 위치(파일:라인 근처) | 새 지역값 찾는 법 |
|---|---|---|---|
| 기상청 격자 nx/ny | 51 / 109 | `backend` 시크릿/vars `TAEAN_NX`·`TAEAN_NY` (기본값은 `env/sources.ts`, `tour/demand.ts`) | 기상청 단기예보 "동네예보 격자좌표" 엑셀에서 시군구 검색 |
| 대기측정소 시도/이름 | sidoName=충남, 태안읍 | `env/sources.ts` (`sidoName:"충남"`, `.includes("태안")`) / 시크릿 `TAEAN_AIR_STATION` | 에어코리아 측정소 목록(해당 시도) |
| 국토부 실거래 시군구코드 | 44825(태안군) | 시크릿 `TAEAN_LAWD_CD` (`env/realestate.ts`) | 법정동코드 앞 5자리 |
| 지역 중심 좌표(일출/일몰·해변 박스) | lat 36.745 / lon 126.298 | `tour/marine.ts` `TAEAN_LAT`·`TAEAN_LON` + 박스 36.55~37.1/126.05~126.5 | 지도 중심 좌표 |
| 해수욕장 코드(기상청) | 만리포=70·꽃지=44 | `tour/marine.ts` `KMA_BEACHES` | 기상청 해수욕장 페이지 `rpt_beach_NN.html` 번호 |
| 조석 예보지점(KHOA obsCode) | 안흥=DT_0067 | `tour/marine.ts` `TIDE_OBS` | 조석예보 API 스캔(DT_0001~, obsvtrNm 매칭) |
| 서핑 지점명 | 만리포해수욕장 | `tour/marine.ts` `fetchSurf` (`includes("만리포")`) | 서핑지수 API 응답 surfPlcNm 중 해당 지역 |
| 생활기상 areaNo | 4482500000(태안군) | `env/living.ts` `TAEAN_AREA` | getUVIdxV5에 행정구역코드(시군구+00000) 넣어 resultCode 00 확인 |
| 오피넷 시도코드 | 05(충남) | `env/oil.ts` `CHUNGNAM` | 오피넷 SIDOCD(서울01·경기02·…·충남05) |
| 검색 키워드 | 태안/꽃지/만리포/안면도 | `env/search_trend.ts` `KEYWORDS` | 지역 대표 관광 키워드 |
| TourAPI 지역코드 | 충남=34 | `env/tour.ts`(areaCode) | TourAPI areaCode2 |
| 제철 먹거리 | 꽃게·바지락·천일염… | `web/.../report-charts.tsx` `TAEAN_SEAFOOD` | 지역 특산물 월별 |
| 알림 발신자 | mailto:admin@taeannews.co.kr | `backend/wrangler.jsonc` `VAPID_SUBJECT` | 해당 신문사 메일 |

> ⚠️ 현재 일부는 **env 시크릿**(NX/NY/AIR_STATION/LAWD_CD), 나머지는 **소스 하드코딩**. 권장 개선은 §3.

---

## 2. 필요한 키 / 활용신청 (지역 무관, 신문사별 1회)

| 키/신청 | 용도 | 발급처 | 등록 |
|---|---|---|---|
| `DATA_GO_KR_KEY` | 날씨·대기질·실거래·해수욕지수·조석·서핑·자외선 등 | data.go.kr | `wrangler secret put` |
| ↳ 활용신청 데이터셋 | 15043550(해양관측)·15102239(해수욕장날씨)·15142484(해수욕지수)·15156018(조석)·15142490(서핑)·15085288(생활기상) | data.go.kr 각 페이지 "활용신청"(자동승인, 반영 10분~1h) | — |
| `OPINET_KEY` | 주유 평균가 | opinet.co.kr 인증키발급 | `wrangler secret put` |
| `NAVER_CLIENT_ID`/`SECRET` | 검색 관심도(데이터랩) | developers.naver.com(데이터랩 API) | `wrangler secret put` (이름 인자 뒤 프롬프트에 값) |
| `VAPID_PUBLIC/PRIVATE_KEY` | Web Push | 자체 생성(W3C, Firebase 미사용) | vars+secret |
| `TAEAN_ID`/`PW` | 신문 회원 로그인(전문 수집) | 해당 신문사 계정 | `wrangler secret put` |

---

## 3. 권장 개선 (재적용을 "1파일 편집"으로)

현재 지역상수가 6개 파일에 흩어져 있음. **`backend/src/region.ts` 한 파일로 중앙화**하면 새 지역 적용이 그 파일 편집 + 키 발급으로 끝남:

```ts
// backend/src/region.ts (제안)
export const REGION = {
  name: "태안", grid: { nx: "51", ny: "109" },
  airSido: "충남", airStation: "태안읍", lawdCd: "44825",
  center: { lat: 36.745, lon: 126.298 },
  box: { latMin: 36.55, latMax: 37.1, lonMin: 126.05, lonMax: 126.5 },
  beaches: [{ num: "70", name: "만리포" }, { num: "44", name: "꽃지" }],
  tideObs: "DT_0067", surfSpot: "만리포", uvAreaNo: "4482500000",
  opinetSido: "05", searchKeywords: ["태안","꽃지","만리포","안면도"],
  tourAreaCode: "34",
};
```
→ marine.ts·oil.ts·living.ts·search_trend.ts·demand.ts·sources.ts가 이 상수를 import.
프론트 `TAEAN_SEAFOOD`도 region별 분리.

> 이 중앙화 리팩터는 미적용 상태. 다른 신문사 1곳이라도 확정되면 진행 권장.

---

## 4. 새 지역 적용 체크리스트

1. `region.ts`(또는 §1 표의 각 파일) 지역값 교체
2. data.go.kr 6개 데이터셋 활용신청 + `DATA_GO_KR_KEY` 등록
3. `OPINET_KEY`, `NAVER_*`, `VAPID_*`, 신문 로그인 시크릿 등록
4. 조석 obsCode·해수욕장 코드·areaNo는 API 스캔으로 실측 확정(메모의 방법)
5. 제철 먹거리·발신자메일 등 정적값 교체
6. 배포 후 `/api/reports/metrics`로 각 필드(live·marine·oil·uv·trends) 값 확인
