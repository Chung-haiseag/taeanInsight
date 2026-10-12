import { describe, it, expect } from "vitest";

import { parseHours, kstHourKey, type FcstItem } from "../src/env/hourly";

// /live '시간별 예보' — 기상청 단기예보(getVilageFcst)는 10일 예보와 **같은 응답**을 쓴다.
//   같은 원자료에서 날짜별(10일)과 시각별(24시간) 두 가지를 뽑는다 — 외부 호출을 두 번 하지 않는다.

const items = (rows: Array<[string, string, string, string]>): FcstItem[] =>
  rows.map(([fcstDate, fcstTime, category, fcstValue]) => ({ fcstDate, fcstTime, category, fcstValue }));

const hour = (ymd: string, hhmm: string, temp: string, sky: string, pop: string): Array<[string, string, string, string]> => [
  [ymd, hhmm, "TMP", temp], [ymd, hhmm, "SKY", sky], [ymd, hhmm, "POP", pop], [ymd, hhmm, "PTY", "0"],
];

describe("parseHours — 단기예보를 시각별로 접는다", () => {
  it("기온·하늘·강수확률을 시각마다 뽑고 '17시' 꼴 이름을 붙인다", () => {
    const got = parseHours(items([...hour("20261011", "1700", "26", "1", "20")]), "202610111700");
    expect(got).toEqual([
      { date: "2026-10-11", hour: 17, label: "17시", temp: 26, sky: "맑음", pop: 20 },
    ]);
  });

  it("지난 시각은 버린다", () => {
    const got = parseHours(items([...hour("20261011", "1500", "27", "1", "0"), ...hour("20261011", "1800", "24", "3", "30")]), "202610111700");
    expect(got.map((h) => h.hour)).toEqual([18]);
  });

  it("자정을 넘어가도 날짜 순서대로 이어진다", () => {
    const got = parseHours(items([...hour("20261012", "0100", "18", "1", "0"), ...hour("20261011", "2300", "20", "1", "0")]), "202610112300");
    expect(got.map((h) => `${h.date} ${h.hour}`)).toEqual(["2026-10-11 23", "2026-10-12 1"]);
  });

  it("최대 24시간까지만", () => {
    const rows = Array.from({ length: 40 }, (_, i) => {
      const d = i < 7 ? "20261011" : "20261012";
      const hh = String((17 + i) % 24).padStart(2, "0");
      return hour(d, `${hh}00`, "20", "1", "0");
    }).flat();
    expect(parseHours(items(rows), "202610111700")).toHaveLength(24);
  });

  it("비·눈이 오는 시각은 하늘 대신 비로 적는다", () => {
    const rows = items([["20261011", "1700", "TMP", "19"], ["20261011", "1700", "SKY", "4"], ["20261011", "1700", "PTY", "1"], ["20261011", "1700", "POP", "80"]]);
    expect(parseHours(rows, "202610111700")[0]).toMatchObject({ sky: "비", pop: 80 });
  });

  it("기온이 없는 시각은 버린다 — 그래프에 구멍을 내지 않는다", () => {
    const rows = items([["20261011", "1700", "SKY", "1"], ["20261011", "1800", "TMP", "24"], ["20261011", "1800", "SKY", "1"]]);
    expect(parseHours(rows, "202610111700").map((h) => h.hour)).toEqual([18]);
  });

  it("빈 입력은 빈 배열", () => expect(parseHours([], "202610111700")).toEqual([]));
});

describe("kstHourKey — '지금' 을 예보 시각 키로", () => {
  it("KST 정시로 깎아 YYYYMMDDHHmm 를 만든다", () => {
    // 2026-10-11T07:40Z = KST 16:40 → 1600
    expect(kstHourKey(Date.parse("2026-10-11T07:40:00Z"))).toBe("202610111600");
  });

  it("UTC 날짜가 바뀌기 전에도 KST 날짜로 센다", () => {
    // 2026-10-11T15:10Z = KST 10-12 00:10 → 다음날 0000
    expect(kstHourKey(Date.parse("2026-10-11T15:10:00Z"))).toBe("202610120000");
  });
});
