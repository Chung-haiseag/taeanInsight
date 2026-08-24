// 지면 광고 가려내기 — 아카이브에 섞인 30년 전 분양·구인·매물 광고를 기사와 갈라낸다.
//
//   왜: 전자북 기사 43,269건 중 **12·13면에만 14,021건**(32%)이 평균 100자짜리 광고다.
//     이것이 세 군데를 동시에 오염시킨다 —
//       ① 아카이브 검색 결과의 3분의 1이 30년 전 월세 광고
//       ② 사이트맵 10.4만 URL에 얇은 페이지 1.4만 개(구글 thin content)
//       ③ "37년 기사 10만 건"이라는 문구의 정직성
//
//   ⚠ **면 번호로 자르면 안 된다.** 실측해 보니 광고는 12·13면에만 있지 않다 —
//     01면 '허내과'·'미래조명', 08면 '삼성화재 광고'·'그린빌라', 15면 '태안콩나물'이 모두 광고다.
//     반대로 12면에도 진짜 칼럼이 있다('성실한 공복의 길' 2,301자, '마음의 등불' 651자).
//
//   ⚠ **지우지 않는다.** 표시만 달아 검색·사이트맵에서 빼고, 원본 지면에는 그대로 남긴다.
//     되돌릴 수 있어야 한다 — 30년 전 광고도 그 시절 물가·상호를 담은 사료다.

/** 전화번호. 광고는 연락처를 남기려 존재한다 — 가장 강한 신호다. */
const PHONE = /(?:☎|T\s?\.|TEL|전화문의|연락처)|(?:\b0\d{1,2}[-.)]\s?)?\b\d{2,4}[-.]\d{3,4}(?:[-.]\d{4})?\b/;

/** 부동산·구인·판매 어휘. 두 개 이상 겹치면 광고 쪽으로 기운다. */
const AD_WORDS = [
  "매매", "전세", "월세", "사글세", "임대", "보증금", "평형", "분양", "급매", "점포", "상가", "사무실",
  "구함", "모집", "아르바이트", "사원", "기술자", "홀써빙", "주방아줌마", "침식제공", "숙식제공",
  "팝니다", "삽니다", "드립니다", "세놓음", "권리금", "무료로", "할인", "개업", "대리점", "판매", "구입",
  // 매물 설비 어휘 — 전화번호가 안 잡힌 광고를 여기서 건진다('그린빌라: 방 2칸, 욕실, 씽크대').
  "보일러", "씽크대", "싱크대", "입식부엌", "화장실", "욕실", "주차장", "방2", "방3", "독채", "연립",
];
// ⚠ '문의'는 뺐다 — 행사 안내 기사에도 흔해서 오탐을 만든다(문의 전화는 PHONE이 이미 본다).

/**
 * 기사체 종결어미. 기자가 쓴 글에는 있고 광고에는 없다.
 *   실측 표본 30건에서 이 신호가 광고와 기사를 깨끗하게 갈랐다.
 */
//   ⚠ '습니다·ㅂ니다'는 넣지 않는다 — 광고가 더 즐겨 쓴다('팝니다', '돕습니다', '드립니다').
const NEWS_ENDING = /(했다|였다|었다|하였다|한다|된다|이다|셨다)/;

export interface ArticleLike {
  title?: string | null;
  body?: string | null;
  section?: string | null;
  /** 본문 전체 길이. 앞부분만 떼어 온 경우(대량 조회) 진짜 길이를 따로 넘긴다. */
  length?: number | null;
}

const pageOf = (section: string | null | undefined): number | null => {
  const m = /지면\s*(\d{1,2})\s*면/.exec(section ?? "");
  return m ? Number(m[1]) : null;
};

/** 제목의 안내·공고 표기. 이것만으로는 안 지킨다 — 본문에 기관명이 함께 있어야 한다. */
const NOTICE_TITLE = /(안내|공고|알림|신고|캠페인)/;
/** 관공서·공공기관·군부대. '조합'은 넣지 않는다 — 신협 광고가 있다. '부대'도 단독으론 안 된다(부대찌개). */
const INSTITUTION = /(정부|군청|[가-힣]*전화국|경찰청|경찰서|보건소|[가-힣]*교육청|우체국|읍사무소|면사무소|한국전력|국세청|병무청|군부대|제\s?\d+\s?부대|선거관리위원회)/;

export interface AdVerdict { ad: boolean; score: number; why: string[] }

/**
 * 광고인가(순수). 점수를 매기고 **왜 그렇게 봤는지** 함께 돌려준다 —
 *   사람이 표본을 눈으로 확인할 수 있어야 대량 표시를 맡길 수 있다.
 */
export function adScore(a: ArticleLike): AdVerdict {
  const title = (a.title ?? "").trim();
  const body = (a.body ?? "").trim();
  const text = `${title} ${body}`;
  const len = typeof a.length === "number" ? a.length : body.length;
  const page = pageOf(a.section);
  const why: string[] = [];
  let s = 0;

  if (/광고/.test(title)) { s += 3; why.push("제목에 '광고'"); }
  if (PHONE.test(text)) { s += 2; why.push("전화번호"); }

  const hits = AD_WORDS.filter((w) => text.includes(w));
  // 어휘가 넷 이상 겹치면 전화번호가 없어도 매물이다('그린빌라: 방 2칸, 욕실, 씽크대, 주차장').
  if (hits.length >= 4) { s += 3; why.push(`광고 어휘 ${hits.slice(0, 4).join("·")}`); }
  else if (hits.length >= 2) { s += 2; why.push(`광고 어휘 ${hits.slice(0, 3).join("·")}`); }
  else if (hits.length === 1) { s += 1; why.push(`광고 어휘 ${hits[0]}`); }

  if (len < 200) { s += 1; why.push("본문 200자 미만"); }
  // 본문에서 연락처를 걷어내면 남는 게 없는 것 — 상호와 전화번호뿐인 박스광고다('허내과: 외곽도로 T.674-8649').
  const rest = body.replace(/[0-9()\-.~/☎]|T\s?\.|TEL/gi, "").replace(/\s+/g, "");
  if (len > 0 && rest.length <= 15) { s += 2; why.push("본문이 연락처뿐"); }
  if (page === 12 || page === 13) { s += 1; why.push(`${page}면(광고면)`); }

  // 기사체 종결어미가 있으면 기자가 쓴 글이다 — 강하게 되돌린다.
  if (NEWS_ENDING.test(body)) { s -= 3; why.push("기사체 종결어미"); }
  // 관공서·군부대의 안내·공고 — '습니다'체라 기사체 보호를 못 받는다(정부 공고가 광고로 잡혔었다).
  //   ⚠ '안내'만으로 지키면 안 된다: 업소 '개업 안내'는 광고다. 제목의 안내·공고 + 본문의 기관명이 함께 있어야 한다.
  if (NOTICE_TITLE.test(title) && INSTITUTION.test(text)) { s -= 4; why.push("관공서 안내·공고"); }
  // 화보 면 — 캡션에 옆 광고 조각이 섞여 추출된다('사진으로 보는'이 광고로 잡혔었다).
  if (/사진으로 보|화보/.test(title)) { s -= 4; why.push("화보"); }
  // 길고 전화번호가 없으면 칼럼·기고다('마음의 등불' 651자).
  if (len >= 600 && !PHONE.test(text)) { s -= 3; why.push("긴 글·연락처 없음"); }

  return { ad: s >= 4, score: s, why };
}

/** 표시 값 — 되돌릴 수 있게 category만 바꾼다(본문·지면은 그대로). */
export const AD_CATEGORY = "ad";

// ── 광고 유형 ─────────────────────────────────────────────────────────────
//   광고는 숨길 것이 아니라 **따로 보여줄 자료**다. 1990~2001년 태안의 전세·매매가와
//   구인 임금이 여기 있고(금액이 적힌 것만 3,788건), 군청 통계에도 없는 읍면 단위 시세다.
//   훑어보려면 갈래가 있어야 한다.

export type AdKind = "부동산" | "구인" | "상점·업소" | "차량·기타" | "기타";

/** 갈래별 표식. 앞의 갈래가 먼저 걸린다 — 부동산 광고에 '판매'가 섞여도 부동산으로 본다. */
const KIND_WORDS: Array<[AdKind, string[]]> = [
  ["부동산", ["전세", "월세", "매매", "임대", "보증금", "평형", "사글세", "독채", "분양", "점포", "상가", "세놓음"]],
  ["구인", ["구함", "모집", "사원", "아르바이트", "홀써빙", "기술자", "주방아줌마", "침식제공", "숙식제공"]],
  ["차량·기타", ["차량", "오토바이", "중고차", "대출", "제작증명"]],
  ["상점·업소", ["판매", "개업", "대리점", "전문점", "할인", "세일", "팝니다", "삽니다"]],
];

/** 광고 하나의 갈래(순수). */
export function adKind(a: ArticleLike): AdKind {
  const text = `${a.title ?? ""} ${a.body ?? ""}`;
  for (const [kind, words] of KIND_WORDS) if (words.some((w) => text.includes(w))) return kind;
  return "기타";
}

/** 금액(만원) 뽑기(순수) — 나중에 시세 추이를 만들 때 쓴다. 표기가 제각각이라 넉넉히 받는다. */
export function moneyMan(text: string): number[] {
  const out: number[] = [];
  for (const m of String(text ?? "").matchAll(/(\d{1,3}(?:,\d{3})*|\d+)\s*만\s*원/g)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}
