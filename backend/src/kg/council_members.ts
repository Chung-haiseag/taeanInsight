// 태안군의회 현직(제10대) 의원 — 이름→공식 사진·직위·선거구. 사진 R2 council/NN.jpg(공개 서빙).
//   출처: council.taean.go.kr 현역의원(정적 이미지). 인물 브리핑 카드가 감지 인물이 현직 의원이면 사진 첨부.

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

// 이름으로 현직 의원 공개 사진 URL. 현직 의원이 아니면 null.
export function councilPhotoFor(name: string): string | null {
  const m = BY_NAME.get((name || "").trim());
  return m ? `/api/archive/photo/council/${m.photo}.jpg` : null;
}

export function councilMemberFor(name: string): CouncilMember | null {
  return BY_NAME.get((name || "").trim()) ?? null;
}
