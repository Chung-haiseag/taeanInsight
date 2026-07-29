import { describe, it, expect } from "vitest";
import { isRelationQuery, buildRelationFactBlock } from "../src/kg/relations";

describe("isRelationQuery", () => {
  it("관계어가 있으면 true", () => {
    expect(isRelationQuery("가세로와 대립한 사람은?")).toBe(true);
    expect(isRelationQuery("성일종 측근이 누구야")).toBe(true);
    expect(isRelationQuery("두 사람 관계 알려줘")).toBe(true);
  });
  it("관계어가 없으면 false", () => {
    expect(isRelationQuery("태안 날씨 어때")).toBe(false);
    expect(isRelationQuery("")).toBe(false);
  });
});

describe("buildRelationFactBlock", () => {
  it("항목 있으면 검증 관계 블록(이름·관계·근거)", () => {
    const b = buildRelationFactBlock("가세로", [
      { name: "홍길동", reltype: "협력·동료", weight: 12, reason: "공동 정책 추진" },
      { name: "김철수", reltype: "대립·갈등", weight: 8 },
    ]);
    expect(b).not.toBeNull();
    expect(b!.text).toContain("가세로의 검증된 인물 관계");
    expect(b!.text).toContain("· 홍길동 — 협력·동료 (공동 정책 추진)");
    expect(b!.text).toContain("· 김철수 — 대립·갈등");
    expect(b!.source.url).toBeNull();
  });
  it("항목 없으면 null(주입 안 함)", () => {
    expect(buildRelationFactBlock("가세로", [])).toBeNull();
  });
});
