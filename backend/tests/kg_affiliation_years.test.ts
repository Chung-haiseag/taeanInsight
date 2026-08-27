import { describe, it, expect } from "vitest";
import { yearRuns, formatYears } from "../src/kg/people";

// 한상기 페이지에 '태안군청 군수 · 2006~2025'가 떴다(사용자 제보 2026-08-27).
//   실제 재임은 2014-07~2018-06다. years는 **재임 기간이 아니라 기사에 나온 해**의 목록인데
//   처음~끝으로 줄여 찍는 바람에 19년 재임처럼 읽혔다. 끊긴 자리를 보이게 한다.
describe("소속 연도 표기", () => {
  it("끊긴 구간을 나눠 보여준다", () => {
    const ys = ["2006","2014","2015","2016","2017","2018","2020","2021","2022","2023","2024","2025"];
    expect(yearRuns(ys)).toBe("2006 · 2014~2018 · 2020~2025");
  });

  it("이어진 해는 한 구간으로 묶는다", () => {
    expect(yearRuns(["2018","2019","2020"])).toBe("2018~2020");
  });

  it("한 해면 그 해만", () => {
    expect(yearRuns(["2014"])).toBe("2014");
  });

  it("구간이 너무 잘게 쪼개지면 처음~끝으로 줄인다", () => {
    expect(yearRuns(["2000","2002","2004","2006","2008"])).toBe("2000~2008");
  });

  it("빈 값·잡값에도 터지지 않는다", () => {
    expect(yearRuns([])).toBe("");
    expect(yearRuns(null)).toBe("");
    expect(yearRuns(["올해","2014"])).toBe("2014");
  });

  it("기존 formatYears는 그대로 둔다(선관위 연도용)", () => {
    expect(formatYears(["2014","2018"])).toBe("2014~2018");
  });
});

// ── 기사 1건짜리 소속은 안 보여준다 ──────────────────────────────────
// 김영인(군의원) 페이지에 '태안군청 군수'와 '경제진흥과 과장'이 떴다(사용자 제보 2026-08-27).
//   근거는 각각 기사 1건 — "…기자브리핑 연 가 군수 김영인…"(원문은 '가세로 군수, 김영인'인데 앞이 잘렸다),
//   "위원장 김영인 경제진흥과장 수고하셨습니"(회의록에서 위원장이 과장을 부르는 대목).
//   검증된 소속 799건 중 235건(29%)이 기사 1건짜리였다.
import { keepWellSupported } from "../src/kg/people";

describe("근거 부족한 소속 걸러내기", () => {
  const rows = [
    { org: "태안군의회", orgId: "o1", role: "군의원", years: "", evidence: "", fromArticles: true, count: 87 },
    { org: "태안군청", orgId: "o2", role: "군수", years: "", evidence: "", fromArticles: true, count: 1 },
    { org: "경제진흥과", orgId: "o3", role: "과장", years: "", evidence: "", fromArticles: true, count: 1 },
    { org: "더불어민주당", orgId: "o4", role: "소속 정당", years: "", evidence: "", fromArticles: false },
  ];

  it("기사 1건짜리는 뺀다", () => {
    expect(keepWellSupported(rows).map((r) => r.orgId)).toEqual(["o1", "o4"]);
  });

  it("선관위에서 온 것은 기사 수가 없어도 남긴다 — 공식 자료다", () => {
    expect(keepWellSupported([rows[3]])).toHaveLength(1);
  });

  it("기사 2건이면 남긴다", () => {
    const two = [{ ...rows[1], count: 2 }];
    expect(keepWellSupported(two)).toHaveLength(1);
  });
});
