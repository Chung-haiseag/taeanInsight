// 지역 설정 — 다른 신문사(지역) 적용 시 이 파일만 교체하면 된다.
// 데이터 소스 자체(엔드포인트·파라미터)는 지역 무관 → env/*·tour/* 코드에 그대로 두고,
// 지역마다 달라지는 값(좌표·코드·키워드)만 여기로 모은다. 자세한 절차는 docs/REGION_PORTING.md.

export interface RegionConfig {
  name: string;                 // 표시명(예: 태안)
  grid: { nx: string; ny: string };          // 기상청 동네예보 격자
  airSido: string;              // 에어코리아 시도명(예: 충남)
  airStationMatch: string;      // 측정소 이름 부분일치(예: 태안)
  lawdCd: string;               // 국토부 실거래 시군구 법정동코드(앞 5자리)
  center: { lat: number; lon: number };       // 일출·일몰 계산용 중심 좌표
  box: { latMin: number; latMax: number; lonMin: number; lonMax: number }; // 해변/지점 위경도 필터
  beaches: Array<{ num: string; name: string }>; // 기상청 해수욕장 코드
  tideObs: string;              // KHOA 조석예보 지점코드(예: DT_0067 안흥)
  surfSpotMatch: string;        // 서핑지수 지점명 부분일치(예: 만리포)
  surfSpotName: string;         // 서핑 표시명
  uvAreaNo: string;             // 생활기상지수 행정구역코드(시군구+00000)
  opinetSido: string;           // 오피넷 시도코드(예: 05 충남)
  searchKeywords: string[];     // 네이버 데이터랩 검색어
  searchGroupName: string;
  tourAreaCode: string;         // TourAPI 지역코드(예: 34 충남)
  eupMyeon: Array<{ code: string; label: string }>; // 읍·면 목록(온보딩·읍면 필터)
  areaTerms: string[];          // 지역 지명(AI 질의 타지역 가드 — 이 지역 용어)
  farmCrops: string;            // 농업 보드 주요 작물(예: 6쪽마늘·생강·고구마)
  aquaSpecies: string;          // 양식 보드 주요 품종(예: 굴·바지락·김·우럭)
}

export const REGION: RegionConfig = {
  name: "태안",
  grid: { nx: "51", ny: "109" },
  airSido: "충남",
  airStationMatch: "태안",
  lawdCd: "44825",
  center: { lat: 36.745, lon: 126.298 },
  box: { latMin: 36.55, latMax: 37.1, lonMin: 126.05, lonMax: 126.5 },
  beaches: [
    { num: "70", name: "만리포" },
    { num: "44", name: "꽃지" },
  ],
  tideObs: "DT_0067",
  surfSpotMatch: "만리포",
  surfSpotName: "만리포",
  uvAreaNo: "4482500000",
  opinetSido: "05",
  searchKeywords: ["태안", "꽃지", "만리포", "안면도", "안면도여행"],
  searchGroupName: "태안관광",
  tourAreaCode: "34",
  eupMyeon: [
    { code: "taean", label: "태안읍" },
    { code: "anmyeon", label: "안면읍" },
    { code: "gonam", label: "고남면" },
    { code: "geunheung", label: "근흥면" },
    { code: "nam", label: "남면" },
    { code: "sowon", label: "소원면" },
    { code: "wonbuk", label: "원북면" },
    { code: "iwon", label: "이원면" },
  ],
  areaTerms: ["태안", "안면", "안흥", "만리포", "꽃지", "신두리", "학암포", "남면", "소원", "원북", "이원", "근흥", "고남", "격렬비", "연포", "몽산포", "천리포", "기지포"],
  farmCrops: "6쪽마늘·생강·고구마",
  aquaSpecies: "굴·바지락·김·우럭",
};
