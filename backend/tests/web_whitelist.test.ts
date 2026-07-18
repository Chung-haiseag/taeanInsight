import { describe, it, expect } from "vitest";
import { isAllowedDomain, WEB_WHITELIST } from "../src/query/web/whitelist";

describe("isAllowedDomain", () => {
  it("화이트리스트 도메인 허용", () => {
    expect(isAllowedDomain("https://www.taean.go.kr/board/123")).toBe(true);
    expect(isAllowedDomain("https://taeannews.co.kr/news/articleView.html?idxno=1")).toBe(true);
  });
  it("서브도메인 허용", () => {
    expect(isAllowedDomain("https://tour.taean.go.kr/x")).toBe(true);
  });
  it("비허용 도메인 거부", () => {
    expect(isAllowedDomain("https://evil.com/taean.go.kr")).toBe(false);
    expect(isAllowedDomain("https://taean.go.kr.evil.com/x")).toBe(false);
  });
  it("잘못된 URL은 false", () => {
    expect(isAllowedDomain("not a url")).toBe(false);
    expect(isAllowedDomain("")).toBe(false);
  });
  it("화이트리스트에 필수 도메인 포함", () => {
    expect(WEB_WHITELIST).toContain("taean.go.kr");
    expect(WEB_WHITELIST).toContain("chungnam.go.kr");
  });
});
