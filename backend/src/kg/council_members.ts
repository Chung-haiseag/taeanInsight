// 태안군의회 의원 사진 — 현직(제10대) 상세(직위·선거구·정당) + 역대(1~9대) 이름→사진. 사진 R2 council/NN|hNN.jpg.
//   출처: council.taean.go.kr 현역/역대의원(정적 이미지, R2 미러). 인물 탐색·브리핑 카드가 감지 인물이 의원이면 사진 첨부.

export interface CouncilMember {
  name: string;
  role: string;      // 의장/부의장/의원
  district: string;  // 가선거구/나선거구/비례대표
  party: string;
  photo: string;     // R2 키 번호(01~07)
}

export const COUNCIL_MEMBERS: CouncilMember[] = [
  { name: "김영인", role: "의장", district: "가선거구", party: "국민의힘", photo: "01" },
  { name: "장영숙", role: "부의장", district: "나선거구", party: "국민의힘", photo: "02" },
  { name: "임해환", role: "의원", district: "가선거구", party: "국민의힘", photo: "03" },
  { name: "홍상금", role: "의원", district: "가선거구", party: "더불어민주당", photo: "04" },
  { name: "김주성", role: "의원", district: "나선거구", party: "더불어민주당", photo: "05" },
  { name: "오동원", role: "의원", district: "나선거구", party: "국민의힘", photo: "06" },
  { name: "최성미", role: "의원", district: "비례대표", party: "국민의힘", photo: "07" },
];

const BY_NAME = new Map(COUNCIL_MEMBERS.map((m) => [m.name, m]));

// 역대 의원(1~9대) 이름→R2 사진키(hNN). 출처: council.taean.go.kr 역대의원(1대~9대 전원, 사진 R2 미러).
//   현직(10대)과 겹치는 김영인은 현직 사진 우선이라 제외. 동명이인은 지역 정치인이라 대개 동일 인물.
const HISTORICAL_COUNCIL: Record<string, string> = {
  "가기순": "h01", "김광모": "h02", "김기두": "h03", "김상호": "h04", "김순환": "h05", "김순희": "h06",
  "김영우": "h07", "김원대": "h09", "김종욱": "h10", "김진권": "h11", "김진묵": "h12", "문제동": "h13",
  "박남규": "h14", "박상엽": "h15", "박선의": "h16", "박용성": "h17", "박인복": "h18", "박종민": "h19",
  "송낙문": "h20", "신경철": "h21", "유익환": "h22", "이기재": "h23", "이만선": "h24", "이상열": "h25",
  "이상윤": "h26", "이영수": "h27", "이용복": "h28", "이용희": "h29", "전재옥": "h30", "정광섭": "h31",
  "정지근": "h32", "조신호": "h33", "조한무": "h34", "조항설": "h35", "조혁": "h36", "차윤선": "h37",
  "최경섭": "h38", "최경환": "h39", "최영신": "h40", "최우평": "h41", "최진환": "h42",
};

// 이름으로 태안군의회 의원 공개 사진 URL. 현직(10대) 우선, 없으면 역대(1~9대). 의원이 아니면 null.
export function councilPhotoFor(name: string): string | null {
  const nm = (name || "").trim();
  const m = BY_NAME.get(nm);
  if (m) return `/api/archive/photo/council/${m.photo}.jpg`;
  const h = HISTORICAL_COUNCIL[nm];
  return h ? `/api/archive/photo/council/${h}.jpg` : null;
}

export function councilMemberFor(name: string): CouncilMember | null {
  return BY_NAME.get((name || "").trim()) ?? null;
}
