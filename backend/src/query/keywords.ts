// AI 질의 RAG 검색 키워드 추출 — 조사 제거 + 지역어 희석 제거(순수 함수).
//
// 두 가지 검색 품질 버그를 해결:
//  1) 조사 미제거: "군의원들을"을 그대로 검색하면 23건(무관)만 매칭. "군의원"이면 2,577건(정확).
//  2) 지역어 희석: "태안"·"태안군"은 코퍼스의 ~40%(4만건)와 매칭 → OR로 넣으면 bm25 순위 파괴.

// 질문에서 흔한 요청 표현을 제거(검색 신호 아님).
export const QUERY_STOP = new Set([
  "알려줘", "알려", "주세요", "관해서", "관하여", "대해서", "대하여", "대해", "무엇", "어떤", "어떻게",
  "현황", "정보", "궁금해", "궁금", "관련", "입니다", "인가", "무슨", "그리고", "에서", "에게", "으로",
  "저것", "이것", "그것", "있나", "있는", "되나", "보여줘", "찾아줘",
]);

// 검색 순위를 파괴하는 ubiquitous 지역어 — 지역명 자체(코퍼스 거의 전체와 매칭).
// 안면·만리포·꽃지 등 세부 지명은 변별력이 있어 제외하지 않는다.
const UBIQUITOUS = new Set(["태안", "태안군"]);

// 떼어낼 조사·어미(긴 것 우선). 지명 끝 글자와 충돌이 큰 단독 조사(도·만·나·랑·께)는 제외해 오제거 방지.
const JOSA = [
  "들에게", "들에서", "들으로", "들을", "들이", "들은", "들의", "에게서",
  "에서", "으로", "에게", "까지", "부터", "라도", "처럼", "만큼", "조차", "마저",
  "을", "를", "이", "가", "은", "는", "의", "에", "와", "과", "로", "들",
];

// 토큰 끝에서 조사를 1회 떼되, 남는 어간이 2글자 이상일 때만(2글자 단어·지명 보호).
function stripJosa(token: string): string {
  for (const j of JOSA) {
    if (token.length - j.length >= 2 && token.endsWith(j)) {
      return token.slice(0, token.length - j.length);
    }
  }
  return token;
}

// 질문 → 검색 키워드(조사 제거·불용어 제거·중복 제거, 원래 순서 유지).
export function extractKeywords(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of query.replace(/[^가-힣0-9a-zA-Z]/g, " ").split(/\s+/)) {
    if (!raw) continue;
    const t = stripJosa(raw);
    if (t.length < 2 || QUERY_STOP.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

// FTS(트라이그램) 대상 토큰 — 3글자 이상, ubiquitous 지역어는 다른 키워드가 있을 때만 제외.
export function ftsRankTokens(tokens: string[]): string[] {
  const three = tokens.filter((t) => t.length >= 3);
  const discriminative = three.filter((t) => !UBIQUITOUS.has(t));
  return discriminative.length ? discriminative : three;
}

export { UBIQUITOUS };
