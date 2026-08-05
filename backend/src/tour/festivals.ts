// 태안 축제·행사 캘린더 — 큐레이션(태안군청 문화관광 + 확인된 실제 시기).
//   ⚠️ TourAPI 축제는 태안 0건이라 무용 → 큐레이션으로 대체. 월·일(from/to) 기반이라 매년 자동 적용.
//   방문자 실측 검증: 5월 피크=튤립축제, 10월 피크=대하축제 (실제 수요 동인 확인).
//   exact2026=true는 발표된 정확 일정, 나머지는 예년 시기(현장 확인 권장). 매년 공식 일정으로 좁히면 됨.

export type Impact = "대형" | "중형" | "소형";

export interface Festival {
  key: string;
  name: string;
  category: string;      // 꽃·수산·문화·빛·해맞이 등
  area: string;          // 개최지
  from: [number, number]; // [월, 일] 시작 (매년 반복)
  to: [number, number];   // [월, 일] 종료
  impact: Impact;
  exact2026?: boolean;    // true=공식 발표 일정 / 없으면 예년 시기(근사)
}

// 태안 주요 축제·행사 (수요 영향 순). 소규모 상시행사(빛축제 등)는 제외하거나 소형으로.
export const TAEAN_FESTIVALS: Festival[] = [
  { key: "tulip", name: "태안 세계튤립꽃축제", category: "꽃", area: "코리아플라워파크(남면)", from: [4, 1], to: [5, 6], impact: "대형", exact2026: true },
  { key: "magnolia", name: "천리포수목원 목련축제", category: "꽃", area: "천리포수목원", from: [3, 25], to: [4, 15], impact: "중형" },
  { key: "allium", name: "코리아플라워파크 알리움축제", category: "꽃", area: "코리아플라워파크", from: [5, 7], to: [5, 31], impact: "중형" },
  { key: "herb", name: "팜카밀레 허브축제", category: "꽃", area: "팜카밀레 허브농원", from: [6, 1], to: [8, 20], impact: "소형" },
  { key: "sea6", name: "모항항 수산물(해삼)축제", category: "수산", area: "모항항", from: [6, 1], to: [6, 21], impact: "소형" },
  { key: "sand", name: "국제 모래조각 페스티벌", category: "문화", area: "신두리 해수욕장", from: [7, 15], to: [8, 15], impact: "중형" },
  { key: "lotus", name: "태안 연꽃축제", category: "꽃", area: "태안읍", from: [7, 20], to: [8, 10], impact: "소형" },
  { key: "shrimp", name: "안면도 백사장 대하축제", category: "수산", area: "백사장항(안면)", from: [9, 19], to: [10, 31], impact: "대형" },
  { key: "crab", name: "신진도 꽃게축제", category: "수산", area: "신진도", from: [10, 1], to: [10, 31], impact: "중형" },
  { key: "salt", name: "태안 자염축제", category: "문화", area: "낭금해변 일원", from: [10, 10], to: [10, 25], impact: "중형" },
  { key: "mum", name: "코리아플라워파크 국화축제", category: "꽃", area: "코리아플라워파크", from: [10, 15], to: [11, 15], impact: "중형" },
  { key: "sunset", name: "꽃지 저녁노을(낙조)축제", category: "문화", area: "꽃지해변", from: [11, 1], to: [12, 31], impact: "중형" },
  { key: "sunrise", name: "태안 해맞이축제", category: "해맞이", area: "꽃지·만리포", from: [12, 31], to: [1, 1], impact: "중형" },
];

// ── 순수 함수 ──
const md = (iso: string): [number, number] => { const [, m, d] = iso.split("-").map(Number); return [m, d]; };
const toKey = (m: number, d: number) => m * 100 + d;

// 주말(토·일) 중 하루라도 축제 기간(from~to)에 들면 해당 축제. 연말 넘김(12→1) 처리.
export function festivalsOnWeekend(satIso: string, sunIso: string, fests: Festival[] = TAEAN_FESTIVALS): Festival[] {
  const days = [md(satIso), md(sunIso)].map(([m, d]) => toKey(m, d));
  return fests.filter((f) => {
    const s = toKey(f.from[0], f.from[1]);
    const e = toKey(f.to[0], f.to[1]);
    if (s <= e) return days.some((k) => k >= s && k <= e);
    return days.some((k) => k >= s || k <= e); // 연말 넘김
  });
}

const IMPACT_PT: Record<Impact, number> = { "대형": 18, "중형": 9, "소형": 4 };

// 축제 수요 가산 — 임팩트 합산, 상한 22. (대형 하나면 +18)
export function festivalBoost(fests: Array<Pick<Festival, "impact">>): number {
  if (!fests.length) return 0;
  const sum = fests.reduce((a, f) => a + (IMPACT_PT[f.impact] ?? 0), 0);
  return Math.min(22, sum);
}

// 오늘 이후 다가오는 축제(정렬) — 표시용. 올해 기준, 이미 지난 건 내년으로.
export function upcomingFestivals(nowIso: string, fests: Festival[] = TAEAN_FESTIVALS, limit = 8): Array<Festival & { nextStart: string }> {
  const [ny, nm, nd] = nowIso.split("-").map(Number);
  const nowKey = toKey(nm, nd);
  return fests
    .map((f) => {
      const s = toKey(f.from[0], f.from[1]);
      // 종료가 시작보다 앞(연말 넘김) 또는 이미 종료 지났으면 내년
      const e = toKey(f.to[0], f.to[1]);
      const ongoing = s <= e ? nowKey >= s && nowKey <= e : nowKey >= s || nowKey <= e;
      const year = ongoing || s >= nowKey ? ny : ny + 1;
      const nextStart = `${year}-${String(f.from[0]).padStart(2, "0")}-${String(f.from[1]).padStart(2, "0")}`;
      return { ...f, nextStart, _ongoing: ongoing };
    })
    .sort((a, b) => (a._ongoing === b._ongoing ? a.nextStart.localeCompare(b.nextStart) : a._ongoing ? -1 : 1))
    .slice(0, limit)
    .map(({ _ongoing, ...f }) => f);
}
