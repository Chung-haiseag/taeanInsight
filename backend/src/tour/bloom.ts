// 꽃·단풍 개화 예측 — 태안=서해 '꽃 관광 1번지'(튤립축제 대형). "지금 뭐가 피었나·만개 D-며칠".
//   낙조처럼 무료 바이럴 유입 + 축제 캘린더와 짝. 태안 관광 공개 개화시기 큐레이션 + 오늘 기준 상태·D-day.
//   새 키 불필요(날짜 계산). ※정밀 GDD(적산온도) 보정은 향후 — 현재는 평년 개화창 기반.

export type BloomStatus = "만개" | "개화중" | "절정지남" | "개화전" | "종료";

export interface Bloom {
  name: string; emoji: string; kind: "꽃" | "단풍" | "억새"; place: string;
  from: [number, number]; peak: [number, number]; to: [number, number]; note: string;
}

// 태안 대표 꽃·단풍·억새(평년 개화창). 매년 실제 개화는 기온에 따라 며칠 이동.
export const TAEAN_BLOOMS: Bloom[] = [
  { name: "동백", emoji: "🌺", kind: "꽃", place: "천리포수목원", from: [12, 1], peak: [1, 20], to: [3, 15], note: "겨울~초봄 붉은 동백" },
  { name: "목련", emoji: "🌼", kind: "꽃", place: "천리포수목원", from: [3, 25], peak: [4, 5], to: [4, 20], note: "천리포 목련 명소" },
  { name: "벚꽃", emoji: "🌸", kind: "꽃", place: "태안읍·안면도", from: [4, 1], peak: [4, 8], to: [4, 18], note: "가로수·해안도로 벚꽃" },
  { name: "튤립", emoji: "🌷", kind: "꽃", place: "코리아플라워파크(남면)", from: [4, 1], peak: [4, 18], to: [5, 6], note: "세계튤립꽃축제 대형" },
  { name: "유채", emoji: "🌼", kind: "꽃", place: "안면도", from: [4, 10], peak: [4, 25], to: [5, 15], note: "노란 유채밭" },
  { name: "알리움", emoji: "🟣", kind: "꽃", place: "코리아플라워파크", from: [5, 7], peak: [5, 18], to: [5, 31], note: "보라 알리움축제" },
  { name: "수국", emoji: "💠", kind: "꽃", place: "천리포수목원", from: [6, 10], peak: [6, 25], to: [7, 15], note: "장마철 수국" },
  { name: "해바라기", emoji: "🌻", kind: "꽃", place: "태안 일원", from: [7, 20], peak: [8, 5], to: [8, 25], note: "한여름 해바라기" },
  { name: "꽃무릇", emoji: "🔴", kind: "꽃", place: "천리포수목원 일원", from: [9, 10], peak: [9, 20], to: [10, 5], note: "붉은 상사화(꽃무릇)" },
  { name: "코스모스", emoji: "🌸", kind: "꽃", place: "태안 들녘", from: [9, 1], peak: [9, 25], to: [10, 15], note: "가을 코스모스" },
  { name: "억새", emoji: "🌾", kind: "억새", place: "안면도·파도리", from: [10, 10], peak: [10, 30], to: [11, 20], note: "가을 은빛 억새" },
  { name: "단풍", emoji: "🍁", kind: "단풍", place: "천리포수목원·백화산", from: [10, 25], peak: [11, 8], to: [11, 25], note: "수목원 단풍 절정" },
];

// ── 순수 함수 ──
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]; // 평년(비윤년) 월누적일
function doy(m: number, d: number): number { return CUM[m - 1] + d; }

// 오늘 기준 개화 상태 + 만개까지 D-day(최단 순환거리).
export function bloomStatus(
  from: [number, number], peak: [number, number], to: [number, number], today: [number, number],
): { status: BloomStatus; daysToPeak: number } {
  const T = doy(today[0], today[1]);
  const F = doy(from[0], from[1]);
  const P = doy(peak[0], peak[1]);
  const To = doy(to[0], to[1]);
  const wrap = To < F; // 연말~연초 걸침(동백)
  const inWin = wrap ? (T >= F || T <= To) : (T >= F && T <= To);
  let dtp = P - T;
  if (dtp > 182) dtp -= 365; else if (dtp < -182) dtp += 365;

  let status: BloomStatus;
  if (Math.abs(dtp) <= 4) status = "만개";
  else if (inWin && dtp > 0) status = "개화중";
  else if (inWin && dtp < 0) status = "절정지남";
  else if (!inWin && dtp > 0) status = "개화전";
  else status = "종료";
  return { status, daysToPeak: dtp };
}

export interface BloomItem extends Bloom { status: BloomStatus; daysToPeak: number }
export interface BloomBoard {
  available: boolean;
  month: number;
  active: BloomItem[];    // 지금 볼 수 있는(만개·개화중·절정지남)
  upcoming: BloomItem[];  // 다가오는 개화(개화전, 만개 D-45 이내)
}

const STATUS_ORDER: Record<BloomStatus, number> = { "만개": 0, "개화중": 1, "절정지남": 2, "개화전": 3, "종료": 4 };

export function loadBloom(now = new Date(Date.now() + 9 * 3600 * 1000)): BloomBoard {
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const items: BloomItem[] = TAEAN_BLOOMS.map((b) => ({ ...b, ...bloomStatus(b.from, b.peak, b.to, [month, day]) }));
  const active = items
    .filter((i) => i.status === "만개" || i.status === "개화중" || i.status === "절정지남")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || Math.abs(a.daysToPeak) - Math.abs(b.daysToPeak));
  const upcoming = items
    .filter((i) => i.status === "개화전" && i.daysToPeak <= 45)
    .sort((a, b) => a.daysToPeak - b.daysToPeak);
  return { available: active.length > 0 || upcoming.length > 0, month, active, upcoming };
}
