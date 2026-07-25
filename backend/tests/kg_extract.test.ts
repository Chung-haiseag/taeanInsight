import { describe, it, expect } from "vitest";
import { normalizeName, faithfulFilter, personNodeId, pairEdgeId, deriveCoappears } from "../../tools/kg/lib.mjs";

describe("normalizeName", () => {
  it("양끝 공백·문장부호 제거, 내부 공백 축약", () => {
    expect(normalizeName('  이완섭  ')).toBe("이완섭");
    expect(normalizeName('"이완섭"')).toBe("이완섭");
    expect(normalizeName('이  완섭')).toBe("이 완섭");
  });
  it("빈 입력은 빈 문자열", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
  });
});

describe("faithfulFilter", () => {
  it("본문에 있는 이름만 남기고 없는 이름은 버림(중복·1글자 제거)", () => {
    const body = "이완섭 군수는 남기정 대표와 만났다.";
    expect(faithfulFilter(["이완섭", "남기정", "가상인물", "이완섭", "김"], body)).toEqual(["이완섭", "남기정"]);
  });
  it("인접 단어에 걸친 조각·토큰 중간 조각은 버림(교차어 방지)", () => {
    const body = "김철수 위원장과 박영희 의원이 참석했다.";
    expect(faithfulFilter(["수위", "장과"], body)).toEqual([]);
    expect(faithfulFilter(["김철수", "박영희"], body)).toEqual(["김철수", "박영희"]);
  });
  it("조사가 붙은 이름도 인정(토큰 시작 매칭)", () => {
    expect(faithfulFilter(["이완섭"], "이완섭이 말했다")).toEqual(["이완섭"]);
  });
});

describe("personNodeId", () => {
  it("정규화 이름으로 person id 생성", () => {
    expect(personNodeId(" 이완섭 ")).toBe("person:이완섭");
  });
});

describe("pairEdgeId", () => {
  it("순서 무관 동일 id(대칭)", () => {
    expect(pairEdgeId("person:가", "person:나")).toBe(pairEdgeId("person:나", "person:가"));
    expect(pairEdgeId("person:가", "person:나")).toBe("coappears:person:가|person:나");
  });
});

describe("deriveCoappears", () => {
  it("공유 기사쌍을 가중치·기사목록으로 집계(self 제외, 대칭 1회)", () => {
    const out = deriveCoappears({ "100": ["person:a", "person:b"], "101": ["person:a", "person:b", "person:c"] });
    const ab = out.find((e) => e.id === pairEdgeId("person:a", "person:b"));
    const ac = out.find((e) => e.id === pairEdgeId("person:a", "person:c"));
    expect(ab.weight).toBe(2);
    expect(ab.articles).toEqual([100, 101]);
    expect(ac.weight).toBe(1);
    expect(ac.articles).toEqual([101]);
    expect(out).toHaveLength(3); // a-b, a-c, b-c
  });
});
