import { describe, it, expect } from "vitest";
import { toCandidate, sortByConfidence } from "../src/kg/affiliation_queue";

describe("toCandidate", () => {
  it("attrs_json을 파싱해 후보로 변환", () => {
    const c = toCandidate({
      id: "e:belongs:가세로__org:taean-gov", src_id: "person:가세로", dst_id: "org:taean-gov",
      person: "가세로", org: "태안군청",
      attrs_json: JSON.stringify({ role: "군수", count: 1996, confidence: 0.95, years: ["2018", "2019"], evidence: ["가세로 군수"], sources: ["123"] }),
    });
    expect(c.person).toBe("가세로");
    expect(c.org).toBe("태안군청");
    expect(c.role).toBe("군수");
    expect(c.confidence).toBe(0.95);
    expect(c.count).toBe(1996);
    expect(c.years).toEqual(["2018", "2019"]);
  });

  it("깨진/빈 attrs_json도 안전(기본값)", () => {
    const c = toCandidate({ id: "e", src_id: "person:X", dst_id: "org:y", person: "홍길동", org: "Y", attrs_json: "{oops" });
    expect(c.confidence).toBe(0);
    expect(c.role).toBe("");
    expect(c.evidence).toEqual([]);
  });
});

describe("sortByConfidence", () => {
  it("신뢰도 내림차순, 동률이면 count 내림차순", () => {
    const base = { id: "", personId: "", person: "", orgId: "", org: "", role: "", years: [], evidence: [], sources: [] };
    const out = sortByConfidence([
      { ...base, confidence: 0.6, count: 2 },
      { ...base, confidence: 0.9, count: 1 },
      { ...base, confidence: 0.6, count: 9 },
    ]);
    expect(out.map((x) => [x.confidence, x.count])).toEqual([[0.9, 1], [0.6, 9], [0.6, 2]]);
  });
});
