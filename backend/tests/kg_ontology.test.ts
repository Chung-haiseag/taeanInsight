import { describe, it, expect } from "vitest";
import { isKnownType, isValidEdge, type Ontology } from "../src/kg/ontology";

const O: Ontology = {
  types: new Set(["person", "office"]),
  relations: new Map([["held", { src: "person", dst: "office", attrs: ["start", "end", "ordinal"] }]]),
};

describe("ontology 검증", () => {
  it("등록된 타입은 허용, 미등록은 거부", () => {
    expect(isKnownType(O, "person")).toBe(true);
    expect(isKnownType(O, "place")).toBe(false);
  });
  it("held는 person→office만 유효", () => {
    expect(isValidEdge(O, "held", "person", "office")).toBe(true);
    expect(isValidEdge(O, "held", "office", "person")).toBe(false); // 양끝 뒤바뀜
    expect(isValidEdge(O, "held", "person", "place")).toBe(false);  // dst 타입 불일치
  });
  it("미등록 관계는 거부", () => {
    expect(isValidEdge(O, "unknown", "person", "office")).toBe(false);
  });
});
