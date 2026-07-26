import { describe, it, expect } from "vitest";
import { withinEdit, blockKey, genCandidates } from "../../tools/kg/merge-lib.mjs";

describe("withinEdit", () => {
  it("동일·1글자차는 true, 2글자+차·길이차>1은 false", () => {
    expect(withinEdit("김동이", "김동이")).toBe(true);
    expect(withinEdit("김동이", "김동위")).toBe(true);   // 1 치환
    expect(withinEdit("김동", "김동이")).toBe(true);     // 1 삽입
    expect(withinEdit("김동이", "박서준")).toBe(false);
    expect(withinEdit("김", "김동이")).toBe(false);      // 길이차 2
  });
});
describe("blockKey", () => {
  it("길이+첫글자", () => { expect(blockKey("김동이")).toBe(blockKey("김철수")); expect(blockKey("김동이")).not.toBe(blockKey("가세로")); });
});
describe("genCandidates", () => {
  it("블록 내 편집거리≤1 쌍을 정렬쌍으로", () => {
    const c = genCandidates([
      { id: "person:김동이", name: "김동이", mentions: 100 },
      { id: "person:김동위", name: "김동위", mentions: 5 },
      { id: "person:가세로", name: "가세로", mentions: 50 },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].a_id < c[0].b_id).toBe(true);
    expect(new Set([c[0].a_id, c[0].b_id])).toEqual(new Set(["person:김동이", "person:김동위"]));
  });
});

import { resolveCanonical } from "../src/kg/merge";
describe("resolveCanonical", () => {
  it("병합 노드 치환·중복 등장수합·중복 엣지 weight합·self 제거", () => {
    const map = { "person:김동위": "person:김동이" };
    const nodes = [
      { id: "person:김동이", name: "김동이", mentions: 100 },
      { id: "person:김동위", name: "김동위", mentions: 5 },
      { id: "person:가세로", name: "가세로", mentions: 50 },
    ];
    const edges = [
      { a: "person:김동이", b: "person:가세로", weight: 3 },
      { a: "person:김동위", b: "person:가세로", weight: 2 }, // 병합 후 김동이-가세로로 합쳐짐(weight 5)
      { a: "person:김동이", b: "person:김동위", weight: 9 }, // 병합 후 self → 제거
    ];
    const r = resolveCanonical(nodes, edges, map);
    expect(r.nodes.find((n) => n.id === "person:김동이").mentions).toBe(105);
    expect(r.nodes.some((n) => n.id === "person:김동위")).toBe(false);
    const e = r.edges.find((e) => (e.a === "person:가세로" || e.b === "person:가세로"));
    expect(e.weight).toBe(5);
    expect(r.edges.some((e) => e.a === e.b)).toBe(false);
  });
});
