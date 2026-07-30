import { describe, it, expect } from "vitest";

import { parseKNum, extractChartData } from "./chart-extract";

describe("parseKNum", () => {
  it("한국어 수(만·억)·콤마를 숫자로", () => {
    expect(parseKNum("95만 3279")).toBe(953279);
    expect(parseKNum("1775만")).toBe(17750000);
    expect(parseKNum("953,279")).toBe(953279);
    expect(parseKNum("1억 2000만")).toBe(120000000);
    expect(parseKNum("196만 1155명")).toBe(1961155);
  });
  it("숫자 없으면 null", () => {
    expect(parseKNum("없음")).toBeNull();
    expect(parseKNum("")).toBeNull();
  });
});

describe("extractChartData", () => {
  it("실제 답변에서 월별 방문객 5개를 line 차트로 추출", () => {
    const answer =
      "2025년도 태안을 방문한 인구는 약 1775만 명입니다. 월별 방문객 수는 다음과 같습니다. " +
      "* 1월: 95만 3279명 * 2월: 91만 6860명 * 4월: 173만 6914명 * 8월: 196만 1155명 * 10월: 194만 8366명";
    const r = extractChartData(answer);
    expect(r.length).toBe(1);
    expect(r[0].type).toBe("line");
    expect(r[0].points.map((p) => p.label)).toEqual(["1월", "2월", "4월", "8월", "10월"]);
    expect(r[0].points.map((p) => p.value)).toEqual([953279, 916860, 1736914, 1961155, 1948366]);
  });

  it("'1월부터 4월' 같은 작은 오인 숫자는 제외", () => {
    // 월 2개뿐 + 값이 작음 → 차트 없음
    expect(extractChartData("2024년 1월부터 4월까지는 전년 대비 5% 줄었다.")).toEqual([]);
  });

  it("연도별 값(만/억)이 2개 이상이면 line 차트", () => {
    const r = extractChartData("2023년 방문객은 1775만 명, 2024년은 1733만 명, 2025년은 1809만 명이었다.");
    expect(r.length).toBe(1);
    expect(r[0].points.map((p) => p.label)).toEqual(["2023년", "2024년", "2025년"]);
    expect(r[0].points.map((p) => p.value)).toEqual([17750000, 17330000, 18090000]);
  });

  it("수치가 없거나 한 개뿐이면 빈 배열", () => {
    expect(extractChartData("태안은 아름다운 관광지입니다.")).toEqual([]);
    expect(extractChartData("2025년 방문객은 1775만 명입니다.")).toEqual([]);
  });
});
