import { describe, it, expect } from "vitest";

import { chartPoints, summarizeHours } from "./hourly-geometry";

// 시간별 예보 꺾은선 — 좌표 계산만 따로 뺀다(그려 보지 않고도 검증할 수 있게).
//   세로 눈금은 24시간 전체를 같은 자로 잰다. 시각마다 자가 다르면 비교가 안 된다.

const h = (hour: number, temp: number) => ({ date: "2026-10-11", hour, label: `${hour}시`, temp, sky: "맑음", pop: 0 });

describe("chartPoints", () => {
  it("가로는 고르게 나누고, 세로는 최저↔최고를 뒤집어 그린다(위가 더움)", () => {
    const { points, lo, hi } = chartPoints([h(10, 20), h(11, 30)], { width: 100, height: 60, pad: 10 });
    expect({ lo, hi }).toEqual({ lo: 20, hi: 30 });
    expect(points[0]).toMatchObject({ x: 0, y: 50 });   // 최저 → 아래
    expect(points[1]).toMatchObject({ x: 100, y: 10 }); // 최고 → 위
  });

  it("기온이 모두 같아도 0으로 나누지 않는다 — 가운데 선", () => {
    const { points } = chartPoints([h(10, 18), h(11, 18)], { width: 100, height: 60, pad: 10 });
    expect(points.map((p) => p.y)).toEqual([30, 30]);
  });

  it("한 시각뿐이면 가운데에 점 하나", () => {
    const { points } = chartPoints([h(10, 18)], { width: 100, height: 60, pad: 10 });
    expect(points).toHaveLength(1);
    expect(points[0].x).toBe(50);
  });

  it("기온 없는 시각은 빼고 센다", () => {
    const { points, lo, hi } = chartPoints([{ ...h(10, 0), temp: null }, h(11, 22), h(12, 26)], { width: 100, height: 60, pad: 10 });
    expect(points).toHaveLength(2);
    expect({ lo, hi }).toEqual({ lo: 22, hi: 26 });
  });

  it("빈 입력은 빈 결과", () => {
    expect(chartPoints([], { width: 100, height: 60, pad: 10 })).toEqual({ points: [], lo: null, hi: null });
  });
});

describe("summarizeHours — 그래프 아래 한 줄 요약", () => {
  const H = (hour: number, temp: number, sky = "맑음", pop = 0) => ({ date: "2026-10-11", hour, label: `${hour}시`, temp, sky, pop });

  it("최고·최저를 시각과 함께", () => {
    const s = summarizeHours([H(10, 22), H(15, 28), H(6, 17)]);
    expect(s.max).toEqual({ temp: 28, label: "15시" });
    expect(s.min).toEqual({ temp: 17, label: "6시" });
  });

  it("비 소식이 없으면 없다고 적는다 — 침묵은 답이 아니다", () => {
    expect(summarizeHours([H(10, 22), H(11, 23)]).rain).toBe("비 소식 없음");
  });

  it("비 오는 시각대를 처음~끝으로 묶어 적는다", () => {
    const s = summarizeHours([H(10, 22), H(11, 21, "비", 70), H(12, 20, "비", 80), H(13, 21, "맑음", 10)]);
    expect(s.rain).toBe("11시~12시 비");
  });

  it("강수확률이 높으면 하늘이 '흐림'이어도 비로 본다", () => {
    expect(summarizeHours([H(10, 22, "흐림", 60)]).rain).toBe("10시 비");
  });

  it("빈 입력은 전부 null", () => {
    expect(summarizeHours([])).toEqual({ max: null, min: null, rain: null });
  });
});
