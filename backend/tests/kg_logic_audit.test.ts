import { describe, it, expect } from "vitest";
import { LOGIC_CHECKS, summarizeAudit } from "../src/kg/logic_audit";

// 2026-08-28 감사에서 드러난 것: **코드는 고쳤는데 데이터가 안 따라와** 부군수 23명이
//   8일간 '태안군수'로 떠 있었다. 사람이 생각나서 볼 때만 도는 감사는 그걸 못 막는다.
//   여기 검사들은 '논리적으로 불가능한 것'만 담는다 — 참이면 반드시 버그다(추정이 아니다).
describe("논리 감사 정의", () => {
  it("검사마다 열쇠·설명·질의가 있다", () => {
    expect(LOGIC_CHECKS.length).toBeGreaterThanOrEqual(6);
    // 오탐 나는 검사는 넣지 않는다 — 늘 켜진 경고는 아무도 안 본다.
    expect(LOGIC_CHECKS.map((c) => c.key)).not.toContain("role_prefix_truncated");
    for (const c of LOGIC_CHECKS) {
      expect(c.key).toMatch(/^[a-z_]+$/);
      expect(c.label.length).toBeGreaterThan(4);
      expect(c.sql.toLowerCase()).toContain("count(*)");
    }
  });

  // 2026-08-31 정합성 점검에서 찾은 것: 태안군수 1~5대 재임 기간이 4쌍 겹쳐 있었다.
  //   ⚠ 이 검사는 **어떻게 나눠도 겹치는 것**만 센다 — 월 단위로 적힌 두 기간이 인수인계 달을
  //     공유하는 것은 정상이다(그 달 안에서 나누면 된다). 그래서 질의가 두 정밀도를 함께 다룬다.
  it("재임 겹침 검사는 월 단위와 일 단위를 함께 다룬다", () => {
    const c = LOGIC_CHECKS.find((x) => x.key === "office_term_overlap");
    expect(c).toBeTruthy();
    expect(c!.sql).toContain("length(s)=7");   // 월 정밀도 시작 → 그 달 말일까지 늦출 수 있다
    expect(c!.sql).toContain("length(en)=7");  // 월 정밀도 종료 → 그 달 1일까지 당길 수 있다
    expect(c!.sql).toContain("a.ord < b.ord"); // 같은 쌍을 두 번 세지 않는다
  });

  it("열쇠가 겹치지 않는다", () => {
    expect(new Set(LOGIC_CHECKS.map((c) => c.key)).size).toBe(LOGIC_CHECKS.length);
  });
});

describe("감사 결과 요약", () => {
  it("위반이 없으면 정상", () => {
    const s = summarizeAudit([{ key: "a", label: "가", count: 0 }, { key: "b", label: "나", count: 0 }]);
    expect(s.ok).toBe(true);
    expect(s.total).toBe(0);
    expect(s.failed).toEqual([]);
  });

  it("위반이 있으면 큰 것부터 알린다", () => {
    const s = summarizeAudit([
      { key: "a", label: "가", count: 3 }, { key: "b", label: "나", count: 0 }, { key: "c", label: "다", count: 91 }]);
    expect(s.ok).toBe(false);
    expect(s.total).toBe(94);
    expect(s.failed.map((f) => f.key)).toEqual(["c", "a"]);
  });

  it("질의가 실패한 검사는 위반과 구분한다 — 못 센 것과 0건은 다르다", () => {
    const s = summarizeAudit([{ key: "a", label: "가", count: null }, { key: "b", label: "나", count: 0 }]);
    expect(s.ok).toBe(false);
    expect(s.errored.map((e) => e.key)).toEqual(["a"]);
    expect(s.total).toBe(0);
  });
});
