import { describe, it, expect } from "vitest";

import { parseShortDays, mergeTenDays, dayLabel, type ShortDay } from "../src/env/tenday";

// 홈 오른쪽 '10일 예보' 카드용. 기상청은 한 번에 10일을 주지 않는다 —
//   단기예보(getVilageFcst) 오늘~+3일 + 중기예보(getMidLandFcst/getMidTa) +3~+10일을 이어 붙인다.
//   겹치는 날(+3)은 단기가 더 정확하므로 단기를 쓴다.

const items = (rows: Array<[string, string, string, string]>) =>
  rows.map(([fcstDate, fcstTime, category, fcstValue]) => ({ fcstDate, fcstTime, category, fcstValue }));

describe("parseShortDays — 단기예보 항목을 날짜별로 접는다", () => {
  it("TMN·TMX·POP 최대·정오 SKY·비 종류를 날짜마다 뽑는다", () => {
    const rows = items([
      ["20261010", "0600", "TMN", "12"],
      ["20261010", "1500", "TMX", "27"],
      ["20261010", "0900", "POP", "10"],
      ["20261010", "1500", "POP", "30"],
      ["20261010", "1500", "SKY", "1"],
      ["20261010", "1500", "PTY", "0"],
      ["20261011", "0600", "TMN", "14"],
      ["20261011", "1500", "TMX", "27"],
      ["20261011", "1500", "POP", "30"],
      ["20261011", "1500", "SKY", "3"],
      ["20261011", "1800", "PTY", "1"],
    ]);
    expect(parseShortDays(rows)).toEqual([
      { date: "2026-10-10", tmin: 12, tmax: 27, pop: 30, sky: "맑음", pty: null },
      { date: "2026-10-11", tmin: 14, tmax: 27, pop: 30, sky: "구름많음", pty: "비" },
    ]);
  });

  it("정오 SKY가 없으면 그날 첫 SKY를 쓴다", () => {
    const [d] = parseShortDays(items([["20261010", "0300", "SKY", "4"], ["20261010", "0300", "TMX", "20"]]));
    expect(d.sky).toBe("흐림");
  });

  it("값이 없는 항목은 null, 숫자 아닌 값은 버린다", () => {
    const [d] = parseShortDays(items([["20261010", "1500", "SKY", "1"], ["20261010", "1500", "TMX", "-"], ["20261010", "1500", "POP", "x"]]));
    expect(d).toEqual({ date: "2026-10-10", tmin: null, tmax: null, pop: null, sky: "맑음", pty: null });
  });

  it("빈 입력은 빈 배열", () => expect(parseShortDays([])).toEqual([]));
});

describe("mergeTenDays — 단기 + 중기를 오늘부터 10일로", () => {
  const short: ShortDay[] = [
    { date: "2026-10-10", tmin: 12, tmax: 27, pop: 30, sky: "맑음", pty: null },
    { date: "2026-10-11", tmin: 14, tmax: 27, pop: 30, sky: "맑음", pty: null },
    { date: "2026-10-12", tmin: 17, tmax: 26, pop: 60, sky: "흐림", pty: null },
    { date: "2026-10-13", tmin: 16, tmax: 23, pop: 100, sky: "흐림", pty: "비" },
  ];
  const mid = {
    "2026-10-13": { pop: 90, sky: "흐리고 비", tmin: 15, tmax: 22 }, // 겹치는 날 — 단기가 이긴다
    "2026-10-14": { pop: 20, sky: "맑음", tmin: 12, tmax: 21 },
    "2026-10-15": { pop: 20, sky: "맑음", tmin: 7, tmax: 22 },
    "2026-10-16": { pop: 30, sky: "구름많음", tmin: 10, tmax: 23 },
    "2026-10-17": { pop: 30, sky: "구름많음", tmin: 13, tmax: 24 },
    "2026-10-18": { pop: 30, sky: "구름많음", tmin: 13, tmax: 23 },
    "2026-10-19": { pop: 30, sky: "구름많음", tmin: 13, tmax: 23 },
    "2026-10-20": { pop: 30, sky: "구름많음", tmin: 12, tmax: 23 },
    "2026-10-21": { pop: 30, sky: "구름많음", tmin: 12, tmax: 23 }, // 11일째 — 버린다
  };

  it("오늘부터 열흘, 겹치는 날은 단기 값", () => {
    const days = mergeTenDays(short, mid, "2026-10-10");
    expect(days).toHaveLength(10);
    expect(days[0].date).toBe("2026-10-10");
    expect(days[9].date).toBe("2026-10-19");
    expect(days[3]).toMatchObject({ date: "2026-10-13", pop: 100, tmax: 23, source: "short" });
    expect(days[4]).toMatchObject({ date: "2026-10-14", pop: 20, tmax: 21, source: "mid" });
  });

  it("라벨은 오늘·내일·그다음은 날짜와 요일", () => {
    const days = mergeTenDays(short, mid, "2026-10-10");
    expect(days[0].label).toBe("오늘");
    expect(days[1].label).toBe("내일");
    expect(days[2].label).toBe("10.12 월");
    expect(days[2].weekday).toBe("월");
  });

  it("지난 날짜는 넣지 않는다", () => {
    const days = mergeTenDays(short, mid, "2026-10-12");
    expect(days[0].date).toBe("2026-10-12");
    expect(days.some((d) => d.date < "2026-10-12")).toBe(false);
  });

  it("단기가 이기되 단기에 없는 값은 중기로 메운다(단기 끝자락은 기온이 빈다)", () => {
    const partial: ShortDay[] = [{ date: "2026-10-14", tmin: null, tmax: null, pop: 20, sky: "구름많음", pty: null }];
    const [d] = mergeTenDays(partial, mid, "2026-10-14");
    expect(d).toMatchObject({ date: "2026-10-14", pop: 20, sky: "구름많음", tmin: 12, tmax: 21, source: "short" });
  });

  it("비 오는 날은 하늘 대신 비로 적는다", () => {
    const days = mergeTenDays(short, mid, "2026-10-10");
    expect(days[3].sky).toBe("비");
  });

  it("중기가 비면 단기만으로도 돌아간다", () => {
    const days = mergeTenDays(short, {}, "2026-10-10");
    expect(days).toHaveLength(4);
    expect(days.every((d) => d.source === "short")).toBe(true);
  });

  it("둘 다 비면 빈 배열", () => expect(mergeTenDays([], {}, "2026-10-10")).toEqual([]));

  it("구멍 난 날은 건너뛰고 있는 날만 — 날짜 순서는 지킨다", () => {
    const days = mergeTenDays([short[0]], { "2026-10-15": { pop: 10, sky: "맑음", tmin: 7, tmax: 22 } }, "2026-10-10");
    expect(days.map((d) => d.date)).toEqual(["2026-10-10", "2026-10-15"]);
  });
});

describe("dayLabel", () => {
  it("오늘·내일·날짜+요일", () => {
    expect(dayLabel("2026-10-10", "2026-10-10")).toEqual({ label: "오늘", weekday: "토" });
    expect(dayLabel("2026-10-11", "2026-10-10")).toEqual({ label: "내일", weekday: "일" });
    expect(dayLabel("2026-10-13", "2026-10-10")).toEqual({ label: "10.13 화", weekday: "화" });
  });
});
