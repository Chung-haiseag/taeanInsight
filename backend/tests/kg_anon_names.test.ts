import { describe, it, expect } from "vitest";
import { isAnonymizedName } from "../src/kg/people";

// 기사의 익명 표기('김 모 씨', 'A씨', '김OO')가 인물 노드로 잡혀 있었다.
//   '김모' 노드는 기사 323건 — 서로 무관한 수백 명이 한 사람처럼 묶였고, 사건·재판 기사가 많아
//   한 사람이 저 일을 다 한 것처럼 읽힌다(2026-08-27 전수 조사에서 드러남).
describe("익명 표기 걸러내기", () => {
  const anon = ["김모", "이모", "김모씨", "박모", "김씨", "이씨", "A씨", "B씨",
                "K모", "A모씨", "K모씨", "곽00", "김OO", "이○○", "김O", "A", "김모군", "김모양"];
  const real = ["가세로", "진태구", "김성환", "박정희", "고은", "칠만", "김옥",
                "성일종", "Smith", "김연아", "이상", "이정모", "배광모", "구창모", "김경모"];

  it.each(anon)("익명 표기 '%s'는 걸러낸다", (n) => {
    expect(isAnonymizedName(n)).toBe(true);
  });

  it.each(real)("진짜 이름 '%s'는 남긴다", (n) => {
    expect(isAnonymizedName(n)).toBe(false);
  });

  it("빈 값에도 터지지 않는다", () => {
    expect(isAnonymizedName("")).toBe(false);
    expect(isAnonymizedName(null as unknown as string)).toBe(false);
  });
});
