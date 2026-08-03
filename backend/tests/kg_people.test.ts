import { describe, it, expect } from "vitest";
import { isHub, rankCoappears, yearHistogram, topTopics, HUB_MENTIONS, stripHanja, hasForeignScript } from "../src/kg/people";

describe("isHub", () => {
  it("임계 경계(>=5000)", () => {
    expect(HUB_MENTIONS).toBe(5000);
    expect(isHub(4999)).toBe(false);
    expect(isHub(5000)).toBe(true);
    expect(isHub(17835)).toBe(true);
  });
});

describe("rankCoappears", () => {
  const rows = [
    { otherId: "p:a", count: 5 },
    { otherId: "p:hub", count: 999 },
    { otherId: "p:b", count: 9 },
    { otherId: "p:c", count: 9 },
  ];
  it("바이라인 제외 + count 내림차순(동률 otherId)", () => {
    const r = rankCoappears(rows, new Set(["p:hub"]), 10);
    expect(r.map((x) => x.otherId)).toEqual(["p:b", "p:c", "p:a"]);
  });
  it("limit 상한", () => {
    expect(rankCoappears(rows, new Set(["p:hub"]), 2).map((x) => x.otherId)).toEqual(["p:b", "p:c"]);
  });
  it("빈 입력·null 안전", () => {
    expect(rankCoappears([], new Set(), 5)).toEqual([]);
    expect(rankCoappears(undefined as unknown as [], new Set(), 5)).toEqual([]);
  });
});

describe("yearHistogram", () => {
  it("연도 오름차순, null/비유효 연도 skip", () => {
    const r = yearHistogram([
      { year: 2003, count: 4 },
      { year: null, count: 7 },
      { year: 1999, count: 2 },
    ]);
    expect(r).toEqual([{ year: 1999, count: 2 }, { year: 2003, count: 4 }]);
  });
  it("빈 배열", () => { expect(yearHistogram([])).toEqual([]); });
});

describe("topTopics", () => {
  const titles = [
    "가세로 군수 해양신도시 착공",
    "해양신도시 예산 확보",
    "해양신도시 주민설명회",
    "가세로 태안군 방문",   // '태안군'은 UBIQUITOUS 제외, '가세로'는 본인 이름 제외
    "관광 활성화 대책",
  ];
  it("제목 2회 이상 키워드를 빈도순으로, 본인이름·지역명 제외", () => {
    const r = topTopics(titles, "가세로");
    expect(r[0]).toEqual({ term: "해양신도시", count: 3 });
    expect(r.some((t) => t.term === "가세로")).toBe(false);   // 본인 이름 제외
    expect(r.some((t) => t.term === "태안군")).toBe(false);   // 지역명 제외
    expect(r.some((t) => t.term === "관광")).toBe(false);     // 1회는 제외(count>=2)
  });
  it("빈 입력 안전", () => { expect(topTopics([], "홍길동")).toEqual([]); });
});

describe("stripHanja — Workers AI 한자 누출 정제", () => {
  it("흔한 한자 접속어를 한국어로 치환", () => {
    expect(stripHanja("此外, 他는 환경미화원과 함께 나섰다")).toBe("그 외, 그는 환경미화원과 함께 나섰다");
  });
  it("잔여 CJK 한자는 제거하고 한글은 보존", () => {
    expect(stripHanja("가세로는 太安의 군수다")).toBe("가세로는 의 군수다");
    expect(stripHanja("태안군수를 역임한 공무원이다")).toBe("태안군수를 역임한 공무원이다");
  });
  it("한자 제거 후 공백·문장부호 정리", () => {
    expect(stripHanja("장학금을 又 지급하였다")).toBe("장학금을 또한 지급하였다");
  });
  it("한자 없는 정상 문장은 그대로", () => {
    const s = "이용희는 대한노인회 태안군지회장을 맡고 있다.";
    expect(stripHanja(s)).toBe(s);
  });
  it("베트남어 로마자 누출(xuất=出) 토큰 통째 제거 + 외국문자 잔여 없음", () => {
    const out = stripHanja("기사들은 주로 2026년에 집중적으로 xuất판되었으며 계속된다.");
    expect(out).not.toContain("xuất");
    expect(hasForeignScript(out)).toBe(false);
  });
  it("평문 영문 약어(AI·CSV)는 보존", () => {
    expect(stripHanja("AI 보조로 CSV 자료를 제공한다.")).toBe("AI 보조로 CSV 자료를 제공한다.");
  });
  it("4자+ 평문 로마자 오출력(demokracy·existed)은 제거, 약어(≤3)는 보존", () => {
    expect(stripHanja("정치인들이 demokracy 제도를 말했다")).toBe("정치인들이 제도를 말했다");
    expect(stripHanja("그 문제가 existed 하였다")).toBe("그 문제가 하였다");
    expect(stripHanja("AI·CSV·PDF 제공")).toBe("AI·CSV·PDF 제공");
  });
});

describe("hasForeignScript — 한글 브리핑에 섞인 비한글 문자 감지", () => {
  it("한자·성조문자·기타 스크립트는 오염으로 감지", () => {
    expect(hasForeignScript("2026년에 xuất판되었으며")).toBe(true);   // 베트남어 ấ
    expect(hasForeignScript("가세로는 太安의 군수다")).toBe(true);      // 한자
    expect(hasForeignScript("Привет 태안")).toBe(true);               // 키릴
  });
  it("한글·숫자·영문 약어·문장부호만이면 깨끗", () => {
    expect(hasForeignScript("가세로는 태안군수를 역임했다.")).toBe(false);
    expect(hasForeignScript("AI가 CSV로 2026년 자료를 제공한다.")).toBe(false);
  });
});
