import { describe, it, expect } from "vitest";
import { aquaStatus } from "../src/tour/aqua";

describe("aquaStatus", () => {
  it("29℃ 이상 → 고수온 경보", () => {
    const r = aquaStatus(29.5);
    expect(r.level).toBe("경보");
    expect(r.label).toMatch(/고수온/);
  });
  it("28℃대 → 고수온 주의", () => expect(aquaStatus(28.3).level).toBe("주의"));
  it("27℃대 → 고수온 관심", () => expect(aquaStatus(27.2).level).toBe("관심"));
  it("한여름 26℃면 정상", () => expect(aquaStatus(26).level).toBe("정상"));
  it("겨울 3℃ 이하 → 저수온 경보", () => {
    const r = aquaStatus(2.5);
    expect(r.level).toBe("경보");
    expect(r.label).toMatch(/저수온|냉수/);
  });
  it("수온 없으면 정상(라벨 없음)", () => {
    const r = aquaStatus(null);
    expect(r.level).toBe("정상");
    expect(r.label).toBeNull();
  });
});
