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

// ── 공식 재임 표가 있으면 기사 연도를 덮는다 ─────────────────────────────────
import { overrideYearsWithOffice } from "../src/kg/people";

// 정합성 점검(2026-09-05)에서 찾은 것: 김세호 페이지가 직위 표엔 '2010-07 ~ 2011-03'(9개월)인데
//   바로 아래 소속엔 '태안군청 군수 · 1991~2026'이었다 — 기사에 나온 해 14개가 덩어리 4개를 넘어
//   yearRuns가 처음~끝으로 접은 것이다. **35년 군수**로 읽힌다.
//   같은 사실이 위에 공식으로 있으면 아래 기사 집계는 정보를 더하는 게 아니라 **반대되는 신호**다.
describe("공식 재임 표가 있는 직함", () => {
  const offices = [
    { office: "태안군수", start: "2010-07-01", end: "2011-03-31", ordinal: 11 },
  ];

  it("군수 소속의 연도는 공식 재임 기간으로 바꾼다", () => {
    const [r] = overrideYearsWithOffice(
      [{ org: "태안군청", orgId: "org:taean-gov", role: "군수", years: "1991~2026", evidence: "", fromArticles: true, count: 120 }],
      offices,
    );
    expect(r.years).toBe("2010~2011");
    expect(r.fromArticles).toBe(false);   // 이제 '기사에 나온 해'가 아니라 공식 기간이다
  });

  it("두 번 지냈으면 두 구간을 다 적는다", () => {
    const [r] = overrideYearsWithOffice(
      [{ org: "태안군청", orgId: "org:taean-gov", role: "군수", years: "2010~2026", evidence: "", fromArticles: true, count: 1996 }],
      [{ office: "태안군수", start: "2018-07-01", end: "2022-06-30", ordinal: 14 },
       { office: "태안군수", start: "2022-07-01", end: "2026-06-30", ordinal: 15 }],
    );
    expect(r.years).toBe("2018~2026");   // 이어진 두 임기는 한 구간으로
  });

  it("월 단위 기록도 연도로 읽는다 — 1~6대 관선", () => {
    const [r] = overrideYearsWithOffice(
      [{ org: "태안군청", orgId: "org:taean-gov", role: "군수", years: "1990~1991", evidence: "", fromArticles: true, count: 7 }],
      [{ office: "태안군수", start: "1989-11", end: "1991-01", ordinal: 2 }],
    );
    expect(r.years).toBe("1989~1991");
  });

  it("이전 임기가 따로 있고 지금도 재임 중이면 '현재'는 마지막 구간에만 붙는다", () => {
    const [r] = overrideYearsWithOffice(
      [{ org: "태안군청", orgId: "org:taean-gov", role: "군수", years: "2010", evidence: "", fromArticles: true, count: 1 }],
      [{ office: "태안군수", start: "2010-07-01", end: "2011-03-31", ordinal: 11 },
       { office: "태안군수", start: "2026-07-01", end: null, ordinal: 16 }],
    );
    expect(r.years).toBe("2010~2011 · 2026~현재");
  });

  it("재임 중이면 '현재'로", () => {
    const [r] = overrideYearsWithOffice(
      [{ org: "태안군청", orgId: "org:taean-gov", role: "군수", years: "2026", evidence: "", fromArticles: true, count: 42 }],
      [{ office: "태안군수", start: "2026-07-01", end: null, ordinal: 16 }],
    );
    expect(r.years).toBe("2026~현재");
  });

  it("공식 표가 없는 직함(부군수·회장)은 건드리지 않는다", () => {
    const rows = [
      { org: "태안군청", orgId: "org:taean-gov", role: "부군수", years: "2011~2017", evidence: "", fromArticles: true, count: 104 },
      { org: "태안군체육회", orgId: "org:taean-cci", role: "회장", years: "2015~2018", evidence: "", fromArticles: true, count: 9 },
    ];
    expect(overrideYearsWithOffice(rows, offices)).toEqual(rows);
  });

  it("직위 표가 비어 있으면 아무것도 안 한다", () => {
    const rows = [{ org: "태안군청", orgId: "org:taean-gov", role: "군수", years: "1991~2026", evidence: "", fromArticles: true, count: 120 }];
    expect(overrideYearsWithOffice(rows, [])).toEqual(rows);
  });

  it("'군수·회장'처럼 합쳐진 직함은 군수 부분만 공식이라 기사 연도를 남긴다", () => {
    // 회장 연도까지 군수 임기로 덮으면 거짓이 된다. 애매하면 손대지 않는다.
    const rows = [{ org: "org:taean-gov", orgId: "org:taean-gov", role: "군수·회장", years: "1991~2026", evidence: "", fromArticles: true, count: 5 }];
    expect(overrideYearsWithOffice(rows, offices)).toEqual(rows);
  });
});
