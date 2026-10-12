// 10일 예보에서 기온이 빈 날을 시간별 예보로 메운다.
//   왜: 낮이 지나면 기상청 단기예보에서 그날 TMN/TMX 가 사라져 '오늘' 줄이 빈칸이 된다(2026-10-11 라이브).
//   어떻게: 그날 시간별 예보의 최저·최고로 채우되 partial 로 표시한다 — 아침 최저가 이미 지났을 수 있어
//   '오늘의 최저'라고 단정하면 틀린 말이 된다. 화면은 '남은 시간 기준'이라고 적는다.

import type { HourItemView, TenDayItemView } from "@/lib/api/reports";

export type FilledDay = TenDayItemView & { partial?: true };

export function fillDayTempsFromHours(days: TenDayItemView[], hours: HourItemView[]): FilledDay[] {
  if (!hours.length) return days;
  const byDate = new Map<string, number[]>();
  for (const h of hours) {
    if (h.temp == null) continue;
    const list = byDate.get(h.date);
    if (list) list.push(h.temp); else byDate.set(h.date, [h.temp]);
  }
  return days.map((d) => {
    if (d.tmin != null && d.tmax != null) return d;
    const temps = byDate.get(d.date);
    if (!temps?.length) return d;
    return {
      ...d,
      tmin: d.tmin ?? Math.round(Math.min(...temps)),
      tmax: d.tmax ?? Math.round(Math.max(...temps)),
      partial: true as const,
    };
  });
}
