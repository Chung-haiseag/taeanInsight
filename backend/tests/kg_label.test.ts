import { describe, it, expect } from "vitest";
import { normalizeReltype, RELTYPES } from "../../tools/kg/label-lib.mjs";

describe("normalizeReltype", () => {
  it("허용 어휘는 그대로", () => {
    expect(normalizeReltype("협력·동료")).toBe("협력·동료");
    expect(normalizeReltype("전임·후임")).toBe("전임·후임");
  });
  it("부분 표현은 매핑", () => {
    expect(normalizeReltype("협력")).toBe("협력·동료");
    expect(normalizeReltype("갈등")).toBe("대립·갈등");
    expect(normalizeReltype("소속")).toBe("소속·상하");
    expect(normalizeReltype("가족")).toBe("가족·인척");
  });
  it("어휘 밖·빈값은 기타", () => {
    expect(normalizeReltype("친구관계")).toBe("기타");
    expect(normalizeReltype("")).toBe("기타");
    expect(normalizeReltype(null)).toBe("기타");
  });
  it("RELTYPES에 기타 포함", () => { expect(RELTYPES).toContain("기타"); });
});
