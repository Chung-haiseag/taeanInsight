// 태안군 역대 군수 — 이름→공식 사진·재임 매핑(태안군청 열린군수실 공식).
//   출처: https://www.taean.go.kr/mayor/sub04_01.do (명단·재임기간·인물 사진, 정적 이미지).
//   사진은 R2(ARCHIVE_PHOTOS) mayor/NN.jpg에 미러 → /api/archive/photo/mayor/NN.jpg 공개 서빙.
//   쓰임: 인물 브리핑 카드가 감지 인물이 역대 군수면 공식 사진을 덧붙인다(검증된 사실 표기).

export interface MayorInfo {
  name: string;
  terms: string; // 대수·재임기간(사람 기준, 여러 대면 합침)
  photo: string; // R2 키 번호(01~12)
}

// 이름 → 재임·사진. 13대(대수) 중 진태구가 9~10대·12대를 재임 → 12명(사람)으로 정리, 사진 1장 공유.
export const MAYORS: MayorInfo[] = [
  { name: "윤희신", terms: "16대(2026.7~)", photo: "12" },
  { name: "가세로", terms: "14~15대(2018.7~2026.6)", photo: "11" },
  { name: "한상기", terms: "13대(2014.7~2018.6)", photo: "10" },
  { name: "김세호", terms: "11대(2010.7~2011.3)", photo: "09" },
  { name: "진태구", terms: "9~10대·12대(2002.7~2010.6, 2011.4~2014.6)", photo: "08" },
  { name: "윤형상", terms: "7~8대(1995.7~2002.6)", photo: "07" },
  { name: "김경년", terms: "6대(1994.10~1995.6)", photo: "06" },
  { name: "송성현", terms: "5대(1994.1~1994.10)", photo: "05" },
  { name: "이종은", terms: "4대(1992.7~1994.1)", photo: "04" },
  { name: "권오창", terms: "3대(1991.1~1992.7)", photo: "03" },
  { name: "유응상", terms: "2대(1989.11~1991.1)", photo: "02" },
  { name: "조철행", terms: "1대(1989.1~1989.11)", photo: "01" },
];

const BY_NAME = new Map(MAYORS.map((m) => [m.name, m]));

// 이름으로 역대 군수 공개 사진 URL. 군수가 아니면 null.
export function mayorPhotoFor(name: string): string | null {
  const m = BY_NAME.get((name || "").trim());
  return m ? `/api/archive/photo/mayor/${m.photo}.jpg` : null;
}

// 이름으로 역대 군수 정보(재임·사진 키). 군수가 아니면 null.
export function mayorInfoFor(name: string): MayorInfo | null {
  return BY_NAME.get((name || "").trim()) ?? null;
}
