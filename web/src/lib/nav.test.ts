import { describe, it, expect } from "vitest";
import { hasRole } from "./roles";
import { navActive, visibleNav, NAV_ITEMS } from "./nav";

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

// 2026-11-06 사용자 지적: "상단에 메뉴가 선택된 부분이 하이라이트 되도록".
//   판정 자체는 헤더 컴포넌트 안에 묻혀 있어 시험할 수 없었다 — 꺼내서 박제한다.
describe("navActive — 지금 보고 있는 메뉴 판정", () => {
  it("같은 주소면 켜짐", () => {
    expect(navActive("/live", "/live")).toBe(true);
  });
  it("하위 화면도 그 메뉴가 켜짐 — /citizen/articles 는 시민기자", () => {
    expect(navActive("/citizen/articles", "/citizen")).toBe(true);
  });
  it("앞글자만 같은 남남은 안 켜진다 — /membership 이 /me 를 켜면 안 된다", () => {
    expect(navActive("/membership", "/me")).toBe(false);
  });
  it("/newsletter 같은 이름이 생겨도 /news 를 켜지 않는다", () => {
    expect(navActive("/newsletter", "/news")).toBe(false);
  });
  it("다른 메뉴는 꺼짐", () => {
    expect(navActive("/live", "/news")).toBe(false);
  });
  it("홈은 아무 메뉴도 켜지 않는다", () => {
    expect(navActive("/", "/news")).toBe(false);
  });
  it("멤버십도 다른 메뉴와 똑같이 판정된다 — 단추처럼 생겼다고 예외가 아니다", () => {
    expect(navActive("/membership", "/membership")).toBe(true);
  });
});
