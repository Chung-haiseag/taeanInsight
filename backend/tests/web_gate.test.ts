import { describe, it, expect } from "vitest";
import { needsWeb } from "../src/query/web/gate";

const archive = { source: { url: "/news/123" } };
const realtime = { source: { url: null } };

describe("needsWeb", () => {
  it("로컬 근거가 전혀 없으면 true", () => {
    expect(needsWeb("태안 무슨 일 있어", [])).toBe(true);
  });
  it("아카이브 근거가 있으면(최신 의도 아님) false", () => {
    expect(needsWeb("가로림만 조력발전 역사", [archive])).toBe(false);
  });
  it("실시간 근거가 있으면(최신 의도 아님) false", () => {
    expect(needsWeb("오늘 날씨 어때", [realtime])).toBe(false);
  });
  it("최신-상황 의도면 근거가 있어도 true", () => {
    expect(needsWeb("태안군 최근 발표 뭐 있어", [archive])).toBe(true);
    expect(needsWeb("속보 있어?", [realtime])).toBe(true);
  });
});
