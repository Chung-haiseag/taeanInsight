// 기상특보 파싱 + 수요 감산(순수 함수). 태풍·호우·풍랑 등 = 관광 급감 신호.

import { describe, it, expect } from "vitest";
import { parseWarnings, warningPenalty } from "../src/tour/weather_alert";

describe("parseWarnings", () => {
  it("특보 통보문에서 종류·수준·활성여부를 뽑는다", () => {
    const w = parseWarnings("폭염경보 변경·열대야주의보 발표");
    expect(w.find((x) => x.type === "폭염")).toMatchObject({ level: "경보", active: true });
  });
  it("해제는 비활성", () => {
    const w = parseWarnings("폭염주의보 해제");
    expect(w.find((x) => x.type === "폭염")?.active).toBe(false);
  });
  it("태풍·호우 등 여러 특보를 파싱", () => {
    const w = parseWarnings("호우경보 발표·강풍주의보 발표");
    expect(w.map((x) => x.type).sort()).toEqual(["강풍", "호우"]);
  });
  it("특보 없는 문장은 빈 배열", () => {
    expect(parseWarnings("기상정보 없음")).toEqual([]);
  });
});

describe("warningPenalty", () => {
  it("태풍경보는 큰 감산(음수)", () => {
    expect(warningPenalty(parseWarnings("태풍경보 발표"))).toBeLessThanOrEqual(-20);
  });
  it("경보가 주의보보다 감산 큼", () => {
    const gy = warningPenalty(parseWarnings("호우경보 발표"));
    const jy = warningPenalty(parseWarnings("호우주의보 발표"));
    expect(gy).toBeLessThan(jy);
  });
  it("폭염경보는 중간 감산", () => {
    const p = warningPenalty(parseWarnings("폭염경보 변경"));
    expect(p).toBeLessThan(0);
    expect(p).toBeGreaterThanOrEqual(-10);
  });
  it("해제만 있으면 0", () => {
    expect(warningPenalty(parseWarnings("호우주의보 해제"))).toBe(0);
  });
  it("감산 하한 -30", () => {
    expect(warningPenalty(parseWarnings("태풍경보 발표·호우경보 발표·풍랑경보 발표"))).toBeGreaterThanOrEqual(-30);
  });
});
