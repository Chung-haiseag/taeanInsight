import { describe, it, expect } from "vitest";
import { segmentQuotes } from "./quote-highlight";

describe("segmentQuotes", () => {
  it("곧은 따옴표 인용을 분리한다", () => {
    expect(segmentQuotes('그는 "안녕"이라 말했다')).toEqual([
      { t: "그는 ", quote: false },
      { t: '"안녕"', quote: true },
      { t: "이라 말했다", quote: false },
    ]);
  });

  it("여러 인용을 각각 분리한다", () => {
    const segs = segmentQuotes('"가"면서 "나"라고');
    expect(segs.filter((s) => s.quote).map((s) => s.t)).toEqual(['"가"', '"나"']);
  });

  it("굽은 따옴표도 인용으로 본다", () => {
    const segs = segmentQuotes("말은 “좋다” 였다");
    expect(segs.some((s) => s.quote && s.t === "“좋다”")).toBe(true);
  });

  it("따옴표 없으면 전체가 일반 텍스트", () => {
    expect(segmentQuotes("따옴표 없는 문장")).toEqual([{ t: "따옴표 없는 문장", quote: false }]);
  });

  it("닫는 따옴표 없으면 인용으로 보지 않는다", () => {
    expect(segmentQuotes('열기만 " 한 경우')).toEqual([{ t: '열기만 " 한 경우', quote: false }]);
  });
});
