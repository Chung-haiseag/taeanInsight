// 시간별 예보 꺾은선의 좌표 계산. 그리는 일(SVG)과 분리해 테스트할 수 있게 뺐다.
//   세로 눈금은 24시간 전체를 같은 자로 잰다 — 시각마다 자가 다르면 비교가 안 된다.

import type { HourItemView } from "@/lib/api/reports";

export interface ChartBox { width: number; height: number; pad: number }
export interface ChartPoint { x: number; y: number; temp: number; hour: HourItemView }

export function chartPoints(
  hours: HourItemView[],
  { width, height, pad }: ChartBox,
): { points: ChartPoint[]; lo: number | null; hi: number | null } {
  const usable = hours.filter((h): h is HourItemView & { temp: number } => h.temp != null);
  if (!usable.length) return { points: [], lo: null, hi: null };
  const temps = usable.map((h) => h.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = hi - lo;
  const inner = height - pad * 2;
  const points = usable.map((h, i) => ({
    x: usable.length === 1 ? width / 2 : (i / (usable.length - 1)) * width,
    // span 0(기온이 모두 같음)이면 가운데에 평평하게 — 0으로 나누지 않는다
    y: span === 0 ? height / 2 : pad + (1 - (h.temp - lo) / span) * inner,
    temp: h.temp,
    hour: h,
  }));
  return { points, lo, hi };
}

export interface HourSummary {
  max: { temp: number; label: string } | null;
  min: { temp: number; label: string } | null;
  rain: string | null;   // '11시~12시 비' 또는 '비 소식 없음'
}

/** 그래프 아래 한 줄 요약. 그림을 못 보는 사람에게도 같은 내용을 글로 준다. */
export function summarizeHours(hours: HourItemView[]): HourSummary {
  const usable = hours.filter((h): h is HourItemView & { temp: number } => h.temp != null);
  if (!usable.length) return { max: null, min: null, rain: null };
  let max = usable[0], min = usable[0];
  for (const h of usable) {
    if (h.temp > max.temp) max = h;
    if (h.temp < min.temp) min = h;
  }
  // 하늘이 '비'이거나 강수확률 60% 이상이면 비로 본다(기상청 '비 올 가능성 높음' 기준)
  const wet = hours.filter((h) => (h.sky != null && /비|눈|소나기/.test(h.sky)) || (h.pop ?? 0) >= 60);
  const rain = wet.length === 0 ? "비 소식 없음"
    : wet.length === 1 ? `${wet[0].label} 비`
    : `${wet[0].label}~${wet[wet.length - 1].label} 비`;
  return { max: { temp: max.temp, label: max.label }, min: { temp: min.temp, label: min.label }, rain };
}
