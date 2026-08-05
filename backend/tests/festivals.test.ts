// 태안 축제 캘린더 — 주말 겹침 판정 + 수요 가산(순수 함수). 월·일 기반이라 매년 자동 적용.

import { describe, it, expect } from "vitest";
import { festivalsOnWeekend, festivalBoost, TAEAN_FESTIVALS } from "../src/tour/festivals";

describe("festivalsOnWeekend", () => {
  it("튤립축제 기간(4/1~5/6) 주말을 잡는다", () => {
    const f = festivalsOnWeekend("2026-05-02", "2026-05-03");
    expect(f.some((x) => x.name.includes("튤립"))).toBe(true);
  });
  it("대하축제(9월말~10월) 주말을 잡는다", () => {
    const f = festivalsOnWeekend("2026-10-03", "2026-10-04");
    expect(f.some((x) => x.name.includes("대하"))).toBe(true);
  });
  it("축제 없는 주말(8월 초)은 비거나 여름축제만", () => {
    const f = festivalsOnWeekend("2026-08-08", "2026-08-09");
    expect(f.every((x) => x.from[0] >= 6 && x.from[0] <= 8)).toBe(true); // 여름 범위만 허용
  });
  it("연말 넘김(해맞이 12/31~1/1)도 처리", () => {
    expect(festivalsOnWeekend("2027-01-01", "2027-01-02").some((x) => x.name.includes("해맞이"))).toBe(true);
    expect(festivalsOnWeekend("2026-12-31", "2027-01-01").some((x) => x.name.includes("해맞이"))).toBe(true);
  });
});

describe("festivalBoost", () => {
  it("대형 축제가 중형보다 가산이 크다", () => {
    const big = festivalBoost([{ ...TAEAN_FESTIVALS[0], impact: "대형" } as never]);
    const mid = festivalBoost([{ ...TAEAN_FESTIVALS[0], impact: "중형" } as never]);
    expect(big).toBeGreaterThan(mid);
  });
  it("여러 축제 겹치면 합산하되 상한", () => {
    const many = festivalBoost([
      { impact: "대형" }, { impact: "대형" }, { impact: "중형" },
    ] as never);
    expect(many).toBeLessThanOrEqual(22);
    expect(many).toBeGreaterThan(0);
  });
  it("없으면 0", () => {
    expect(festivalBoost([])).toBe(0);
  });
});

describe("TAEAN_FESTIVALS 데이터", () => {
  it("대표 축제(튤립·대하)를 포함한다", () => {
    const names = TAEAN_FESTIVALS.map((f) => f.name).join(" ");
    expect(names).toMatch(/튤립/);
    expect(names).toMatch(/대하/);
  });
  it("모든 축제에 from/to(월,일)·impact가 있다", () => {
    for (const f of TAEAN_FESTIVALS) {
      expect(f.from).toHaveLength(2);
      expect(f.to).toHaveLength(2);
      expect(["대형", "중형", "소형"]).toContain(f.impact);
    }
  });
});
