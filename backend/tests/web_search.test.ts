import { describe, it, expect } from "vitest";
import { mapTavily } from "../src/query/web/search";

describe("mapTavily", () => {
  const raw = [
    { title: "태안군 공고", url: "https://www.taean.go.kr/a", content: "본문내용".repeat(500), published_date: "2026-07-10" },
    { title: "외부기사", url: "https://evil.com/x", content: "무관" },
    { title: "충남도 소식", url: "https://chungnam.go.kr/b", content: "충남 본문" },
  ];
  it("화이트리스트 도메인만 남긴다", () => {
    const out = mapTavily(raw);
    expect(out.map((s) => s.url)).toEqual([
      "https://www.taean.go.kr/a",
      "https://chungnam.go.kr/b",
    ]);
  });
  it("본문을 cap(기본 1500)으로 자른다", () => {
    const out = mapTavily(raw);
    expect(out[0].text.length).toBeLessThanOrEqual(1500);
  });
  it("title/url이 없는 항목은 제외", () => {
    expect(mapTavily([{ content: "x" }, { title: "t", url: "https://taean.go.kr/y", content: "c" }])).toHaveLength(1);
  });
  it("배열이 아니면 빈 배열", () => {
    expect(mapTavily(null)).toEqual([]);
    expect(mapTavily({})).toEqual([]);
  });
});
