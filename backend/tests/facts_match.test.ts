import { describe, it, expect } from "vitest";
import { matchFacts, type Fact } from "../src/query/facts";

// 실제 facts 표의 키워드를 그대로 옮겼다(2026-08-27). 지어낸 값으로는 이 오탐이 재현되지 않는다.
const f = (id: string, title: string, keywords: string): Fact =>
  ({ id, title, keywords, content: "본문", source: "출처" } as Fact);

const 행정구역 = f("a", "태안군 행정구역", "행정구역 읍 면 태안읍 안면읍 리 몇개면");
const 현직의원 = f("b", "제10대 태안군의회 현직 의원", "현직 의원 현역 의원 태안군의회 의원 명단 선거구별 의원 몇명 지금 의원 군의원");
const 해수욕장 = f("c", "태안군 해수욕장", "해수욕장 해변 만리포 꽃지 몽산포");
const ALL = [행정구역, 현직의원, 해수욕장];

describe("한 글자·일반어로는 걸리지 않는다 — 엉뚱한 근거가 답을 뒤덮었다", () => {
  it("'안면도 백반집…지금도 운영하나' — 실제 오답(2026-08-26)", () => {
    // '면'(한 글자)으로 행정구역이, '지금'으로 현직 의원 명단이 걸려
    //   백반집을 물었는데 군의회 명단과 행정구역을 늘어놓았다.
    expect(matchFacts("안면도 백반집 26년인 지금도 운영하고 있나", ALL)).toEqual([]);
  });
  it("'지금 태안 날씨 어때' 같은 흔한 말에도 안 걸린다", () => {
    expect(matchFacts("지금 태안 날씨 어때", ALL)).toEqual([]);
  });
  it("'이원면 이장님' — 지명에 '면'이 들어가도 행정구역 설명이 붙지 않는다", () => {
    expect(matchFacts("이원면 이장님이 누구야", ALL)).toEqual([]);
  });
});

describe("제대로 물으면 여전히 걸린다", () => {
  it("행정구역", () => {
    expect(matchFacts("태안군 행정구역 알려줘", ALL).map((x) => x.id)).toEqual(["a"]);
    expect(matchFacts("태안군은 몇개면이야?", ALL).map((x) => x.id)).toEqual(["a"]);
    expect(matchFacts("안면읍은 어디 속해?", ALL).map((x) => x.id)).toEqual(["a"]);
  });
  it("현직 의원", () => {
    expect(matchFacts("태안군의회 현직 의원 명단", ALL).map((x) => x.id)).toContain("b");
    expect(matchFacts("군의원 몇명이야?", ALL).map((x) => x.id)).toContain("b");
  });
  it("여러 낱말이 겹치면 더 앞에 온다", () => {
    // '의원'·'명단' 둘 다 낱말 첫머리에서 맞는다.
    expect(matchFacts("의원 명단 보여줘", ALL).map((x) => x.id)).toContain("b");
  });
  it("해수욕장", () => {
    expect(matchFacts("만리포 해수욕장 어때", ALL).map((x) => x.id)).toEqual(["c"]);
  });
});

describe("개수 제한과 정렬", () => {
  it("많이 겹치는 것이 앞에 오고 max개까지만", () => {
    const r = matchFacts("태안군의회 현직 의원 명단 선거구별 군의원 그리고 행정구역", ALL, 1);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("b");
  });
  it("빈 질문·빈 목록은 빈 결과", () => {
    expect(matchFacts("", ALL)).toEqual([]);
    expect(matchFacts("행정구역", [])).toEqual([]);
  });
});
