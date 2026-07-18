// 웹 보강 RAG — 태안 관련 공식·지역 도메인 화이트리스트 + 가드(순수).
// 검색 결과 필터와 fetch 직전 양쪽에서 강제해 범위이탈·SSRF 차단.

export const WEB_WHITELIST = [
  "taean.go.kr",       // 태안군청
  "chungnam.go.kr",    // 충청남도
  "korea.kr",          // 정책브리핑
  "data.go.kr",        // 공공데이터포털
  "visitkorea.or.kr",  // 한국관광공사
  "taeannews.co.kr",   // 주간태안신문
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
