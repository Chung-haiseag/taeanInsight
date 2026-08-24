// 옛 광고에서 시세 뽑기 — 광고 21,973건에 적힌 금액으로 30년 물가표를 만든다.
//
//   왜: 1990~2001년 태안의 전세·매매가는 군청 통계에도 없다. 광고가 유일한 기록이다.
//     실측(2026-08-25): 금액이 적힌 광고 4,380건, 라벨 상위가 전세(3,400+)·보증금(1,249)·
//     매매(728)·월세(1,664)·권리금(176)·평당(130)으로 뚜렷했다.
//
//   무엇을 안 뽑나 — 실측에서 성격이 다르다고 확인된 것들:
//     · 융자(224건): 대출액이지 시세가 아니다. '매매가 7,000만원(융자 2,000 포함)'의 융자.
//     · 초봉·임금(41건): 자료가 너무 적다. 나중에 따로.
//     · 판매·구입·가격: 석궁·가라오케·이불 등 품목이 제각각이라 시세 계열이 안 된다.
//     · 사글세: 선불 기간(1년·10개월)이 광고마다 달라 단위를 맞출 수 없다.
//
//   ⚠ OCR 분절: '전 세가 500만원'·'보 증금 100만원'처럼 글자가 벌어진 표기가 실제로 있다.
//     라벨 글자 사이 공백을 허용한다.

export type PriceLabel = "전세" | "매매" | "월세" | "보증금" | "권리금" | "평당";
export const PRICE_LABELS: PriceLabel[] = ["전세", "매매", "월세", "보증금", "권리금", "평당"];

export interface PriceHit { label: PriceLabel; man: number }

/** 금액(만원). 쉼표 표기 허용. */
const AMT = String.raw`([\d,]{1,7})\s*만\s*원`;

// 라벨 → 정규식. 라벨과 금액 사이는 공백·콜론만 허용 — 다른 글자가 끼면 남의 금액이다
//   ('전세 놓으실분 … 융자 3,000만원'에서 전세가 융자 금액을 가로채면 안 된다).
const RULES: Array<[PriceLabel, RegExp]> = [
  ["전세", new RegExp(String.raw`전\s?세\s?[가금]?\s*[:：]?\s{0,3}${AMT}`, "g")],
  ["매매", new RegExp(String.raw`(?:매\s?매\s?가?|급매)\s*[:：]?\s{0,3}${AMT}`, "g")],
  // '월 10만원' 축약형 — 단, '개월'(기간)과 '12월'(날짜)은 아니다.
  ["월세", new RegExp(String.raw`(?:월\s?세|(?<![개\d])월)\s*[:：]?\s{0,3}${AMT}`, "g")],
  ["보증금", new RegExp(String.raw`보\s?증\s?금\s*[:：]?\s{0,3}${AMT}`, "g")],
  ["권리금", new RegExp(String.raw`권\s?리\s?금\s*[:：]?\s{0,3}${AMT}`, "g")],
  ["평당", new RegExp(String.raw`평\s?당\s*[:：]?\s{0,3}${AMT}`, "g")],
];

// 자릿수 방어 — OCR 오독('전세 3만원', '월세 5,000만원')을 시세표에 넣지 않는다.
//   범위는 1990~2001 태안 실물가 기준으로 넉넉히 잡았다.
const BOUNDS: Record<PriceLabel, [number, number]> = {
  전세: [30, 50000],
  매매: [50, 100000],
  월세: [1, 500],
  보증금: [10, 50000],
  권리금: [10, 50000],
  평당: [0.5, 5000],
};

// '매매'는 무엇이든 팔 때 쓰는 말이다 — 실측(1993년 표본)에서 자동차(프라이드 110만원)·
//   중고물품(컨테이너 230만원)이 부동산 시세에 섞였다. 부동산 문맥어가 있고
//   차량·물품 문맥어가 없을 때만 시세로 본다.
const ESTATE = /평|아파트|APT|주택|연립|빌라|대지|상가|점포|한옥|맨션|토지|전답|농가|건물|축사|여관|식당/i;
const NOT_ESTATE = /년식|주행|도어|오토바이|중고차|컨테이너|\dcc/i;

/** 광고 한 건에서 라벨 붙은 금액들을 뽑는다(순수). 같은 라벨·같은 값은 한 번만. */
export function adPrices(a: { title?: string | null; body?: string | null }): PriceHit[] {
  const text = `${a.title ?? ""} ${a.body ?? ""}`;
  const estateOk = ESTATE.test(text) && !NOT_ESTATE.test(text);
  const out: PriceHit[] = [];
  const seen = new Set<string>();
  for (const [label, re] of RULES) {
    if (label === "매매" && !estateOk) continue;
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const man = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(man)) continue;
      const [lo, hi] = BOUNDS[label];
      if (man < lo || man > hi) continue;
      const key = `${label}#${man}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label, man });
    }
  }
  return out;
}
