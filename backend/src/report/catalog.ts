// 공개 데이터 카탈로그 — 예측·경보·시세에 쓰는 데이터 소스(공개 '데이터 지도' 페이지용).
//   내부 지표/비고 없는 깔끔한 공개 설명. 라이브·진행중만(보류/미채택 제외). 관리자 상세는 report/router의 dataSources.

export interface CatalogItem {
  key: string; name: string;
  cat: "관광" | "바다" | "수산" | "농업" | "날씨·안전" | "지역경제";
  type: "예측" | "경보" | "시세" | "실측" | "달력" | "구조" | "검증" | "요인" | "배달";
  status: "live" | "progress";
  source: string;  // 데이터 출처
  desc: string;    // 한 줄 설명
}

export const DATA_CATALOG: CatalogItem[] = [
  // 관광 · 나들이
  { key: "demand", name: "관광 수요지수", cat: "관광", type: "예측", status: "live", source: "종합 신호", desc: "주말 관광 수요를 계절·날씨·축제·특보로 예측" },
  { key: "visitors", name: "관광 방문자 실측", cat: "관광", type: "실측", status: "live", source: "한국관광공사", desc: "태안군 일별 방문자(외지인·현지인·외국인)" },
  { key: "bloom", name: "꽃·단풍 개화 예측", cat: "관광", type: "예측", status: "live", source: "큐레이션·계절", desc: "튤립·유채·단풍 등 만개 시기·상태·D-day" },
  { key: "sunset", name: "낙조(노을) 예보", cat: "관광", type: "예측", status: "live", source: "기상청·에어코리아", desc: "오늘 노을 예쁠지 하늘·습도·미세먼지로 예측" },
  { key: "festivals", name: "축제·행사 캘린더", cat: "관광", type: "달력", status: "live", source: "큐레이션", desc: "태안 축제·행사 일정과 수요 영향" },
  { key: "traffic", name: "고속도로 유입 교통량", cat: "관광", type: "실측", status: "live", source: "한국도로공사", desc: "충남 유입 교통량(관광 선행 신호)" },
  // 바다 · 해변
  { key: "beaches", name: "해수욕장 보드", cat: "바다", type: "예측", status: "live", source: "국립해양조사원·기상청", desc: "해수욕장별 적합도(수온·파고·해수욕지수)" },
  { key: "mudflat", name: "갯벌 물때 적기", cat: "바다", type: "예측", status: "live", source: "국립해양조사원", desc: "조차·낮 간조로 갯벌 체험 적기 추천" },
  { key: "fishing", name: "낚시 출조 지수", cat: "바다", type: "예측", status: "live", source: "국립해양조사원·기상청", desc: "배낚시 출항 적합도(파고·바람·물때·제철어종)" },
  { key: "fog", name: "해무(바다안개) 예보", cat: "바다", type: "경보", status: "live", source: "기상청", desc: "바다안개 위험(도로·항해 가시거리 안전)" },
  // 수산
  { key: "auction", name: "위판장 경매가", cat: "수산", type: "시세", status: "live", source: "해양수산부 위판", desc: "태안 위판장 산지 경락가(사장님이 받는 값)" },
  { key: "auctionForecast", name: "위판 물량·값 추세", cat: "수산", type: "예측", status: "live", source: "해양수산부 위판", desc: "어종별 주간 물량·값 변화·전망" },
  { key: "seafood", name: "수산물 소매 시세", cat: "수산", type: "시세", status: "live", source: "KAMIS", desc: "꽃게·바지락 등 소비자 소매가" },
  { key: "seasonal", name: "제철 수산물", cat: "수산", type: "달력", status: "live", source: "큐레이션·위판", desc: "이번 달 제철 어종 + 현재 경락가" },
  { key: "aqua", name: "양식 수온 경보", cat: "수산", type: "경보", status: "progress", source: "국립해양조사원", desc: "양식 고수온·저수온 폐사 조기경보" },
  // 농업
  { key: "agri", name: "농산물 도매 시세", cat: "농업", type: "시세", status: "live", source: "공영도매시장", desc: "마늘·생강·감자 등 도매 경매가" },
  { key: "farm", name: "영농 경보", cat: "농업", type: "경보", status: "live", source: "기상청·큐레이션", desc: "서리·한파·폭염 + 파종/수확 적기" },
  // 날씨 · 환경 · 안전
  { key: "weather", name: "날씨 단기예보", cat: "날씨·안전", type: "예측", status: "live", source: "기상청", desc: "태안 격자 기온·강수·하늘상태" },
  { key: "alert", name: "기상특보", cat: "날씨·안전", type: "경보", status: "live", source: "기상청", desc: "태풍·호우·풍랑·폭염 특보 실시간" },
  { key: "dust", name: "미세먼지 예보", cat: "날씨·안전", type: "예측", status: "live", source: "에어코리아", desc: "충남 PM10·PM2.5 오늘~모레 등급" },
  { key: "fireRisk", name: "산불위험 지수", cat: "날씨·안전", type: "경보", status: "live", source: "기상청·특보", desc: "건조기 산불 확산 위험도" },
  // 지역경제 · 신뢰 · 배달
  { key: "industry", name: "태안 산업 구조", cat: "지역경제", type: "구조", status: "live", source: "통계청", desc: "농업·수산·관광·에너지 부문 구조" },
  { key: "holiday", name: "공휴일 연휴 요인", cat: "지역경제", type: "요인", status: "live", source: "특일정보", desc: "연휴가 관광 수요에 주는 영향" },
  { key: "demandActuals", name: "수요지수 백테스트", cat: "지역경제", type: "검증", status: "live", source: "실측 대조", desc: "예측 vs 실제 방문자 적중 검증" },
  { key: "brief", name: "오늘의 태안 브리핑", cat: "지역경제", type: "배달", status: "live", source: "Web Push", desc: "매일 아침 핵심 요약을 알림으로 배달" },
  { key: "realestate", name: "부동산 실거래가", cat: "지역경제", type: "실측", status: "live", source: "국토교통부", desc: "태안 아파트·토지 실거래 내역" },
];
