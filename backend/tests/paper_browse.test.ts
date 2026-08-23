import { describe, it, expect } from "vitest";
import { pageNo, groupIssues, EBOOK_MIN, EBOOK_MAX } from "@/archive/paper";

describe("지면 번호 읽기", () => {
  it("'지면 03면' → 3", () => {
    expect(pageNo("지면 03면")).toBe(3);
    expect(pageNo("지면 12면")).toBe(12);
  });
  it("지면이 아니면 null — 현대 기사엔 지면이 없다", () => {
    expect(pageNo("관광")).toBeNull();
    expect(pageNo(null)).toBeNull();
    expect(pageNo("")).toBeNull();
  });
});

describe("발행일별로 묶기", () => {
  const rows = [
    { d: "1997-12-26", section: "지면 01면", n: 5 },
    { d: "1997-12-26", section: "지면 02면", n: 4 },
    { d: "1997-12-26", section: "관광", n: 1 },       // 지면이 아닌 줄은 섞이면 안 된다
    { d: "1997-12-19", section: "지면 01면", n: 6 },
  ];

  it("최신 발행일이 먼저", () => {
    expect(groupIssues(rows).map((i) => i.date)).toEqual(["1997-12-26", "1997-12-19"]);
  });

  it("지면은 번호순으로", () => {
    expect(groupIssues(rows)[0].pages.map((p) => p.no)).toEqual([1, 2]);
  });

  it("지면이 아닌 줄은 담지 않는다", () => {
    expect(groupIssues(rows)[0].pages).toHaveLength(2);
  });

  it("발행일마다 기사 수를 합친다", () => {
    expect(groupIssues(rows)[0].articles).toBe(9);
  });

  it("빈 목록도 안전하다", () => {
    expect(groupIssues([])).toEqual([]);
  });
});

describe("전자북 대역", () => {
  it("범위가 지켜진다 — 현대 기사와 섞이면 지면이 없다", () => {
    expect([EBOOK_MIN, EBOOK_MAX]).toEqual([90000001, 90099999]);
  });
});
