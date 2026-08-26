import { describe, it, expect } from "vitest";
import { hasRole } from "./roles";
import { visibleNav, NAV_ITEMS } from "./nav";

describe("hasRole (프런트 미러)", () => {
  it("동급/상위 통과, 하위·미지·비로그인 실패", () => {
    expect(hasRole("admin", "citizen")).toBe(true);
    expect(hasRole("user", "citizen")).toBe(false);
    expect(hasRole(null, "user")).toBe(false);
    expect(hasRole("editor", "user")).toBe(false);
  });
});

describe("visibleNav — 등급별 메뉴", () => {
  const hrefs = (role: string | null) => visibleNav(role).map((i) => i.href);
  it("비로그인도 아카이브·실시간·멤버십까지 본다(회원 전용만 숨김)", () => {
    const v = hrefs(null);
    expect(v).toContain("/live");
    expect(v).toContain("/news");
    expect(v).toContain("/membership");
    // AI 코파일럿(/query)은 상단 메뉴에 두지 않는다 — 오른쪽 아래 단추로 어디서든 열린다.
    expect(v).not.toContain("/query");
    expect(v).not.toContain("/reports");
    expect(v).not.toContain("/me");
    expect(v).not.toContain("/reporter");
  });
  it("일반회원은 리포트·내페이지 추가, 시민기자·취재알림은 미노출", () => {
    const v = hrefs("user");
    // AI 코파일럿은 등급과 무관하게 상단에 없다(어디서든 오른쪽 아래 단추).
    expect(v).not.toContain("/query");
    expect(v).toContain("/reports");
    expect(v).toContain("/me");
    expect(v).not.toContain("/citizen"); // 시민기자 등급부터
    expect(v).not.toContain("/reporter");
  });
  it("시민기자는 /citizen 노출", () => {
    expect(hrefs("citizen")).toContain("/citizen");
  });
  it("기자는 취재알림까지 노출", () => {
    expect(hrefs("reporter")).toContain("/reporter");
  });
  it("모든 항목에 minRole 필드가 있다(null 허용)", () => {
    for (const i of NAV_ITEMS) expect("minRole" in i).toBe(true);
  });
});
