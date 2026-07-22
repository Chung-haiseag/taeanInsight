import { describe, it, expect } from "vitest";
import { cleanWebQuery } from "../src/query/web/naver";

describe("cleanWebQuery", () => {
  it("대화체·메타 군더더기를 제거해 주제만 남긴다", () => {
    expect(cleanWebQuery("요즘 태안 최근 소식 근황 알려줘")).toBe("태안");
  });
  it("주제어는 보존한다", () => {
    expect(cleanWebQuery("태안 산불 최근 소식")).toBe("태안 산불");
  });
  it("질문 말투(뭐야/어때/궁금해)를 제거한다", () => {
    expect(cleanWebQuery("태안 해수욕장 개장 언제야 궁금해")).toBe("태안 해수욕장 개장 언제야");
  });
  it("군더더기만 남으면 원본을 유지한다", () => {
    expect(cleanWebQuery("알려줘")).toBe("알려줘");
  });
  it("공백을 정리한다", () => {
    expect(cleanWebQuery("  태안   축제   ")).toBe("태안 축제");
  });
});
