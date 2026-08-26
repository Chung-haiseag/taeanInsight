import { describe, it, expect } from "vitest";
import { publishedLabel, weekLabel } from "./report-date";

describe("발행일 표기 — 한국 시각으로 고정한다", () => {
  it("실제 발행분(2026-W33)", () => {
    expect(publishedLabel("2026-08-13T09:03:24.392Z")).toBe("2026년 8월 13일");
  });
  it("UTC로는 어제인 밤 시각도 한국 날짜로 센다", () => {
    // 2026-08-13T15:30Z = 한국 8월 14일 00:30. 보는 사람이 어디에 있든 발행일은 하나여야 한다
    // — 출향 자녀가 해외에서 보면 하루 어긋나 '지난주 것'으로 보인다.
    expect(publishedLabel("2026-08-13T15:30:00.000Z")).toBe("2026년 8월 14일");
  });
  it("값이 없거나 깨졌으면 빈 문자열 — 화면에서 조용히 빠진다", () => {
    expect(publishedLabel("")).toBe("");
    expect(publishedLabel("어제")).toBe("");
    expect(publishedLabel(undefined)).toBe("");
  });
});

describe("주차 표기", () => {
  it("2026-W33 → 2026년 33주차", () => {
    expect(weekLabel("2026-W33")).toBe("2026년 33주차");
  });
  it("앞의 0을 떼어낸다", () => {
    expect(weekLabel("2026-W07")).toBe("2026년 7주차");
  });
  it("모르는 꼴은 그대로 둔다 — 지어내지 않는다", () => {
    expect(weekLabel("2026-08")).toBe("2026-08");
  });
});
