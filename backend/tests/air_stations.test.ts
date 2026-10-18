import { describe, it, expect } from "vitest";

import { windWords, summarizeAir, worstPmGrade, plausiblePm, type AirRow } from "../src/env/sources";

// /live 날씨 머리칸 — 바람은 '3.2m/s'만으로는 감이 안 온다. 방향을 우리말로 붙인다.
describe("windWords — 풍향·풍속을 읽히는 말로", () => {
  it("각도를 8방위 우리말로", () => {
    expect(windWords(3.2, 0)?.dir).toBe("북");
    expect(windWords(3.2, 90)?.dir).toBe("동");
    expect(windWords(3.2, 225)?.dir).toBe("남서");
    expect(windWords(3.2, 359)?.dir).toBe("북");
  });

  it("세기를 쉬운 말로 — 숫자만으로 말하지 않는다", () => {
    expect(windWords(0.8, 0)?.strength).toBe("바람 거의 없음");
    expect(windWords(3.2, 0)?.strength).toBe("약한 바람");
    expect(windWords(7.0, 0)?.strength).toBe("조금 강한 바람");
    expect(windWords(10.5, 0)?.strength).toBe("강한 바람");
  });

  it("풍속이 없으면 null — 방향만으로는 쓸모가 없다", () => {
    expect(windWords(null, 90)).toBeNull();
  });

  it("방향을 모르면 세기만 준다", () => {
    expect(windWords(3.2, null)).toEqual({ speed: 3.2, dir: null, strength: "약한 바람" });
  });
});

// 에어코리아 시도 전체 응답을 한 번만 받아 ① 태안 대표 측정소 ② 태안 측정소 목록 ③ 충남 평균을 함께 뽑는다.
const row = (stationName: string, pm10: string, pm25: string, khaiGrade = "2"): AirRow =>
  ({ stationName, pm10Value: pm10, pm25Value: pm25, khaiGrade, o3Value: "0.03" });

describe("summarizeAir — 한 번 받은 시도 목록에서 셋을 뽑는다", () => {
  const rows = [row("태안읍", "51", "20", "3"), row("태안항", "44", "18"), row("성연면", "30", "12"), row("독곶리", "-", "-")];

  it("태안 측정소를 대표로 고르고 태안 것만 따로 모은다", () => {
    const s = summarizeAir(rows, "태안");
    expect(s.station).toBe("태안읍");
    expect(s.pm10).toBe(51);
    expect(s.grade).toBe("나쁨");
    expect(s.stations).toEqual([
      { name: "태안읍", pm10: 51, pm25: 20 },
      { name: "태안항", pm10: 44, pm25: 18 },
    ]);
  });

  it("시도 평균은 값이 있는 측정소만으로 반올림해 센다", () => {
    const s = summarizeAir(rows, "태안");
    expect(s.sidoAvgPm10).toBe(42); // (51+44+30)/3 = 41.67
    expect(s.sidoAvgPm25).toBe(17); // (20+18+12)/3 = 16.67
  });

  it("태안읍이 비면 값이 있는 태안 측정소로 넘어간다", () => {
    const s = summarizeAir([row("태안읍", "-", "-", "-"), row("태안항", "44", "18")], "태안");
    expect(s.station).toBe("태안항");
    expect(s.pm10).toBe(44);
  });

  it("태안 측정소가 하나뿐이면 목록은 비운다 — 한 줄짜리 목록은 같은 말 두 번", () => {
    expect(summarizeAir([row("태안읍", "51", "20"), row("성연면", "30", "12")], "태안").stations).toEqual([]);
  });

  it("빈 목록이어도 터지지 않는다", () => {
    expect(summarizeAir([], "태안")).toMatchObject({ station: null, pm10: null, stations: [], sidoAvgPm10: null });
  });
});

// 2026-10-11: 아침 브리핑이 통합대기지수 등급('나쁨', 오존 탓)을 '미세먼지 나쁨'이라 적고 있었다.
//   미세먼지 42·초미세먼지 31은 둘 다 '보통'이었다 — 푸시로도 나가는 문장이라 틀리면 안 된다.
describe("worstPmGrade — 미세먼지·초미세먼지 중 나쁜 쪽", () => {
  it("둘 중 나쁜 쪽", () => {
    expect(worstPmGrade(42, 31)).toBe("보통");
    expect(worstPmGrade(42, 40)).toBe("나쁨");
    expect(worstPmGrade(160, 10)).toBe("매우나쁨");
  });
  it("한쪽만 있으면 그쪽, 둘 다 없으면 null", () => {
    expect(worstPmGrade(null, 10)).toBe("좋음");
    expect(worstPmGrade(null, null)).toBeNull();
  });
});

// ── 측정기 고장값 거르기 (2026-10-12) ──
//   태안항이 미세먼지 985㎍/㎥를 뱉었다(초미세먼지는 42로 멀쩡). 그대로 화면에 나갔고,
//   태안읍이 비는 순간 대표값이 되어 아침 푸시가 '미세먼지 매우나쁨'이라 말했다.
describe("plausiblePm — 말이 안 되는 실측은 버린다", () => {
  it("정상 범위는 그대로 통과", () => {
    expect(plausiblePm("pm10", 71)).toBe(71);
    expect(plausiblePm("pm25", 27)).toBe(27);
    expect(plausiblePm("pm10", 0)).toBe(0);
  });

  it("미세먼지 600 초과는 버린다 — 국내 최악 황사도 이 위는 사실상 없다", () => {
    expect(plausiblePm("pm10", 985)).toBeNull();
    expect(plausiblePm("pm10", 600)).toBe(600);
  });

  it("초미세먼지 300 초과는 버린다", () => {
    expect(plausiblePm("pm25", 420)).toBeNull();
    expect(plausiblePm("pm25", 300)).toBe(300);
  });

  it("음수와 빈 값은 버린다", () => {
    expect(plausiblePm("pm10", -1)).toBeNull();
    expect(plausiblePm("pm10", null)).toBeNull();
    expect(plausiblePm("pm25", NaN)).toBeNull();
  });
});

describe("summarizeAir — 고장난 측정소", () => {
  const rows = (list: AirRow[]) => list;

  it("고장값은 측정소 목록에서도 빈칸으로 — 초미세먼지는 멀쩡하면 살린다", () => {
    const air = summarizeAir(rows([
      { stationName: "태안읍", pm10Value: "71", pm25Value: "27", khaiGrade: "2" },
      { stationName: "태안항", pm10Value: "985", pm25Value: "42", khaiGrade: "2" },
    ]), "태안");
    expect(air.stations).toEqual([
      { name: "태안읍", pm10: 71, pm25: 27 },
      { name: "태안항", pm10: null, pm25: 42 },
    ]);
  });

  it("대표 측정소가 고장나도 그 값만 비우고 다른 항목은 남긴다", () => {
    const air = summarizeAir(rows([
      { stationName: "태안항", pm10Value: "985", pm25Value: "42", khaiGrade: "2" },
    ]), "태안");
    expect(air.pm10).toBeNull();
    expect(air.pm25).toBe(42);
  });

  it("고장값은 충남 평균에도 넣지 않는다", () => {
    const air = summarizeAir(rows([
      { stationName: "태안읍", pm10Value: "70", pm25Value: "20" },
      { stationName: "태안항", pm10Value: "985", pm25Value: "40" },
      { stationName: "서산", pm10Value: "60", pm25Value: "18" },
    ]), "태안");
    expect(air.sidoAvgPm10).toBe(65);   // (70+60)/2 — 985 제외
    expect(air.sidoAvgPm25).toBe(26);   // (20+40+18)/3
  });

  it("에어코리아가 점검·통신장애 표시를 달면 그 값은 쓰지 않는다", () => {
    const air = summarizeAir(rows([
      { stationName: "태안읍", pm10Value: "71", pm25Value: "27", pm10Flag: "점검및교정" },
    ]), "태안");
    expect(air.pm10).toBeNull();
    expect(air.pm25).toBe(27);
  });
});

// ── 대표 측정소 고르기 (2026-10-12) ──
//   985를 걸러냈더니 다음 문제가 드러났다: 태안항은 미세먼지가 고장나 비었는데도 목록 앞에 있다는
//   이유로 대표가 되어, 태안읍이 71/27로 멀쩡한데도 화면의 미세먼지가 '—'로 비었다.
describe("summarizeAir — 대표 측정소는 성한 곳으로", () => {
  it("두 값 다 있는 측정소를 먼저 쓴다 — 목록 순서보다 성한 쪽이 우선", () => {
    const air = summarizeAir([
      { stationName: "태안항", pm10Value: "985", pm25Value: "42", khaiGrade: "4" },
      { stationName: "태안읍", pm10Value: "71", pm25Value: "27", khaiGrade: "2" },
    ], "태안");
    expect(air.station).toBe("태안읍");
    expect(air.pm10).toBe(71);
    expect(air.pm25).toBe(27);
    expect(air.grade).toBe("보통");
  });

  it("둘 다 성한 곳이 없으면 하나라도 있는 곳", () => {
    const air = summarizeAir([
      { stationName: "태안항", pm10Value: "985", pm25Value: "42" },
      { stationName: "태안읍", pm10Value: "-", pm25Value: "-" },
    ], "태안");
    expect(air.station).toBe("태안항");
    expect(air.pm25).toBe(42);
  });

  it("아무 데도 값이 없으면 첫 측정소를 쓰되 값은 비운다", () => {
    const air = summarizeAir([{ stationName: "태안읍", pm10Value: "-", pm25Value: "-", khaiGrade: "2" }], "태안");
    expect(air.station).toBe("태안읍");
    expect(air.pm10).toBeNull();
    expect(air.grade).toBe("보통");
  });
});
