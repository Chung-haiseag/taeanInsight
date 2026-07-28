import { describe, it, expect } from "vitest";
import { decodeEntities } from "./decode-entities";

describe("decodeEntities", () => {
  it("명명 엔티티(middot·따옴표)", () => {
    expect(decodeEntities("시장&middot;군수")).toBe("시장·군수");
    expect(decodeEntities("&lsquo;가&rsquo;")).toBe("‘가’");
    expect(decodeEntities("&ldquo;나&rdquo;")).toBe("“나”");
    expect(decodeEntities("A &amp; B")).toBe("A & B");
  });
  it("숫자 엔티티(10진·16진)", () => {
    expect(decodeEntities("&#183;")).toBe("·");
    expect(decodeEntities("&#x2019;")).toBe("’");
  });
  it("끝에 잘린 미완성 엔티티는 말줄임", () => {
    expect(decodeEntities("문장이다&rdq")).toBe("문장이다…");
  });
  it("빈 문자열·일반 텍스트는 그대로", () => {
    expect(decodeEntities("")).toBe("");
    expect(decodeEntities("일반 텍스트")).toBe("일반 텍스트");
  });
});
