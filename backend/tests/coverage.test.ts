import { describe, it, expect } from "vitest";
import { coverageStatus } from "../src/kg/coverage";

const NOW = Date.parse("2026-08-08T00:00:00Z");

describe("coverageStatus", () => {
  it("최근 보도면 정체 아님", () => {
    const r = coverageStatus("2026-07-01T00:00:00+09:00", NOW);
    expect(r.stale).toBe(false);
    expect(r.gapDays).toBeLessThan(60);
  });
  it("6개월 이상 무보도면 정체", () => {
    const r = coverageStatus("2025-01-01T00:00:00+09:00", NOW);
    expect(r.stale).toBe(true);
    expect(r.gapDays).toBeGreaterThan(180);
  });
  it("언급 없음/파싱불가는 정체", () => {
    expect(coverageStatus(null, NOW).stale).toBe(true);
    expect(coverageStatus(null, NOW).gapDays).toBeNull();
    expect(coverageStatus("bad-date", NOW).stale).toBe(true);
  });
});
