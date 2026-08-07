import { describe, it, expect } from "vitest";
import { toFestival, sortByCount } from "../src/kg/event_queue";

describe("toFestival", () => {
  it("attrs_json 파싱", () => {
    const c = toFestival({ id: "event:fest:해삼축제", name: "해삼축제", attrs_json: JSON.stringify({ kind: "축제", count: 42, years: ["2015", "2016"], evidence: ["제5회 해삼축제"], sources: ["1"] }) });
    expect(c.name).toBe("해삼축제");
    expect(c.count).toBe(42);
    expect(c.years).toEqual(["2015", "2016"]);
  });
  it("깨진 attrs_json 안전", () => {
    const c = toFestival({ id: "e", name: "X", attrs_json: "{bad" });
    expect(c.count).toBe(0);
    expect(c.evidence).toEqual([]);
  });
});

describe("sortByCount", () => {
  it("언급수 내림차순", () => {
    const base = { id: "", name: "", years: [], evidence: [], sources: [] };
    const out = sortByCount([{ ...base, count: 5 }, { ...base, count: 40 }, { ...base, count: 12 }]);
    expect(out.map((x) => x.count)).toEqual([40, 12, 5]);
  });
});
