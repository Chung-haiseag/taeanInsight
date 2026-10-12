import { describe, it, expect } from "vitest";

import { fillDayTempsFromHours } from "./tenday-fill";

// 10일 예보 '오늘' 줄이 빈칸인 문제(2026-10-11 라이브). 낮이 지나면 기상청 단기예보에서
//   그날 TMN/TMX 가 사라진다. 시간별 예보에는 **남은 시간** 기온이 남아 있으니 그걸로 채우되,
//   아침 최저가 이미 지났을 수 있으므로 '남은 시간 기준'임을 표시한다 — 실측인 척하지 않는다.

const day = (date: string, tmin: number | null, tmax: number | null) =>
  ({ date, label: date, weekday: "일", sky: "맑음", pop: 0, tmin, tmax, source: "short" as const });
const hour = (date: string, hourNum: number, temp: number) =>
  ({ date, hour: hourNum, label: `${hourNum}시`, temp, sky: "맑음", pop: 0 });

describe("fillDayTempsFromHours", () => {
  it("기온이 비었고 그날 시간별 값이 있으면 그 최저·최고로 채우고 표시를 남긴다", () => {
    const [d] = fillDayTempsFromHours([day("2026-10-11", null, null)], [hour("2026-10-11", 18, 22), hour("2026-10-11", 23, 17)]);
    expect(d).toMatchObject({ tmin: 17, tmax: 22, partial: true });
  });

  it("이미 기온이 있으면 건드리지 않는다", () => {
    const [d] = fillDayTempsFromHours([day("2026-10-12", 16, 27)], [hour("2026-10-12", 18, 22)]);
    expect(d).toMatchObject({ tmin: 16, tmax: 27 });
    expect(d.partial).toBeUndefined();
  });

  it("한쪽만 비어도 그쪽만 채운다", () => {
    const [d] = fillDayTempsFromHours([day("2026-10-11", 11, null)], [hour("2026-10-11", 18, 22)]);
    expect(d).toMatchObject({ tmin: 11, tmax: 22, partial: true });
  });

  it("그날 시간별 값이 없으면 빈칸 그대로 — 지어내지 않는다", () => {
    const [d] = fillDayTempsFromHours([day("2026-10-11", null, null)], [hour("2026-10-12", 18, 22)]);
    expect(d).toMatchObject({ tmin: null, tmax: null });
    expect(d.partial).toBeUndefined();
  });

  it("시간별이 아예 없으면 그대로 돌려준다", () => {
    expect(fillDayTempsFromHours([day("2026-10-11", null, null)], [])[0].tmin).toBeNull();
  });
});
