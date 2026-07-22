// 웹 보강 RAG — 태안 관련 공식·지역 도메인 화이트리스트 + 가드(순수).
// 검색 결과 필터와 fetch 직전 양쪽에서 강제해 범위이탈·SSRF 차단.

export const WEB_WHITELIST = [
  // 공식(관공서·공공) — 서브도메인 포함(예: council.taean.go.kr 군의회, tour.taean.go.kr)
  "taean.go.kr",       // 태안군청(+군의회 등 서브도메인)
  "chungnam.go.kr",    // 충청남도
  "korea.kr",          // 정책브리핑
  "data.go.kr",        // 공공데이터포털
  "kostat.go.kr",      // 통계청
  "mois.go.kr",        // 행정안전부(주민등록 인구 등)
  "visitkorea.or.kr",  // 한국관광공사
  // 지역언론(공신력 있는 태안 보도)
  "taeannews.co.kr",   // 주간태안신문
  "chungnamilbo.co.kr", // 충남일보
  "dtnews24.com",      // 디트뉴스24
];

// 호스트가 화이트리스트 도메인이거나 그 서브도메인이면 true.
export function isAllowedDomain(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return WEB_WHITELIST.some((d) => host === d || host.endsWith(`.${d}`));
}
