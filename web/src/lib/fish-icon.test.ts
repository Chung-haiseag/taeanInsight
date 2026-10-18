// 품목 상징 — 이름 옆에 붙는 작은 그림. 어떤 것인지 눈으로 먼저 알아보라고 둔다(고령 독자).
// ⚠ 모르면 **비운다**. 아무 그림이나 붙이면 엉뚱한 것을 알려 주는 셈이라 안 붙이느니만 못하다.
// ⚠ 그림은 거들 뿐이다 — 이름이 바로 옆에 있으므로 화면낭독기에서는 숨긴다(aria-hidden).
import { describe, expect, it } from "vitest";

import { itemIcon } from "./fish-icon";

describe("itemIcon — 수산물·농산물 이름에 붙는 상징", () => {
  it("게·새우·오징어·문어 갈래를 구분한다", () => {
    expect(itemIcon("꽃게")).toBe("🦀");
    expect(itemIcon("대하")).toBe("🦐");
    expect(itemIcon("갑오징어")).toBe("🦑");
    expect(itemIcon("낙지")).toBe("🐙");
    expect(itemIcon("주꾸미")).toBe("🐙");
  });

  it("조개와 굴·전복을 나눈다", () => {
    expect(itemIcon("바지락")).toBe("🐚");
    expect(itemIcon("꼬막")).toBe("🐚");
    expect(itemIcon("전복")).toBe("🦪");
    expect(itemIcon("굴")).toBe("🦪");
  });

  it("생선은 생선으로", () => {
    expect(itemIcon("갈치")).toBe("🐟");
    expect(itemIcon("조피볼락")).toBe("🐟");
    expect(itemIcon("돌가자미")).toBe("🐟");
    expect(itemIcon("붕장어")).toBe("🐟");
  });

  it("해조류와 농산물", () => {
    expect(itemIcon("김")).toBe("🌿");
    expect(itemIcon("미역")).toBe("🌿");
    expect(itemIcon("마늘")).toBe("🧄");
    expect(itemIcon("고추")).toBe("🌶️");
  });

  // 위판 자료는 '류'를 붙여 온다 — 갑오징어류·갈치류·병어류·서대류
  it("'류'가 붙어도 같은 것으로 본다", () => {
    expect(itemIcon("갑오징어류")).toBe("🦑");
    expect(itemIcon("갈치류")).toBe("🐟");
    expect(itemIcon("서대류")).toBe("🐟");
    expect(itemIcon("병어류")).toBe("🐟");
  });

  // 위판 자료는 '선어/활어' 같은 상태가 이름에 섞여 오기도 한다
  it("이름 안에 들어 있어도 찾는다", () => {
    expect(itemIcon("활 꽃게")).toBe("🦀");
    expect(itemIcon("냉동 갈치")).toBe("🐟");
  });

  it("더 긴 이름이 먼저 — 오징어보다 갑오징어", () => {
    expect(itemIcon("갑오징어")).toBe("🦑");
    expect(itemIcon("오징어")).toBe("🦑");
  });

  // 한 글자 이름(굴·김·무·게)이 다른 말 안에 숨어 엉뚱하게 걸리지 않아야 한다
  it("굴비는 생선이지 굴이 아니다", () => {
    expect(itemIcon("굴비")).toBe("🐟");
    expect(itemIcon("굴")).toBe("🦪");
  });

  // 2026-10-17 운영 위판 자료에 실제로 들어온 12종 — 하나도 엉뚱하면 안 된다
  it("오늘 위판장에 올라온 어종을 모두 알아본다", () => {
    const got = ["갑오징어류", "갈치류", "노래미류", "붕장어", "꽃게", "대하",
                 "낙지", "돌가자미", "서대류", "조피볼락", "병어류", "병어"].map(itemIcon);
    expect(got).toEqual(["🦑", "🐟", "🐟", "🐟", "🦀", "🦐", "🐙", "🐟", "🐟", "🐟", "🐟", "🐟"]);
  });

  // 실데이터를 훑어 빈칸으로 남던 것들(2026-10-18)
  it("간재미·가오리는 생선, 감태는 해조류", () => {
    expect(itemIcon("간재미")).toBe("🐟");
    expect(itemIcon("기타가오리류")).toBe("🐟");
    expect(itemIcon("감태")).toBe("🌿");
  });

  it("모르는 것은 비운다 — 지어내지 않는다", () => {
    expect(itemIcon("기타")).toBe("");
    expect(itemIcon("")).toBe("");
    expect(itemIcon("알 수 없는 어종")).toBe("");
  });
});
