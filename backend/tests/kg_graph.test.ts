import { describe, it, expect } from "vitest";
import { rankNeighbors, type Edge } from "../src/kg/graph";

const edges: Edge[] = [
  { a: "p:c", b: "p:a", weight: 5 },
  { a: "p:b", b: "p:c", weight: 9 },
  { a: "p:c", b: "p:d", weight: 2 },
  { a: "p:x", b: "p:y", weight: 7 },
];

describe("rankNeighbors", () => {
  it("center 인접 이웃을 weight 내림차순으로", () => {
    expect(rankNeighbors(edges, "p:c", 10).map((n) => n.id)).toEqual(["p:b", "p:a", "p:d"]);
  });
  it("limit 상한", () => {
    expect(rankNeighbors(edges, "p:c", 2).map((n) => n.id)).toEqual(["p:b", "p:a"]);
  });
  it("self·무관 엣지 제외", () => {
    expect(rankNeighbors([{ a: "p:c", b: "p:c", weight: 3 }, { a: "p:x", b: "p:y", weight: 1 }], "p:c", 10)).toEqual([]);
  });
});
