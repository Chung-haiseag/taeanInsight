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

// ── 사람 아닌 이름(추출 부산물) ────────────────────────────────────────
// 모순 감사에서 드러났다(2026-08-28): 기사 본문의 낱말이 인물 노드가 돼 소속·직함까지 달고 있었다.
//   '김부'·'최부' ← "김 부군수"·"최 부군수"를 붙여 쓴 표기, '권한' ← "군수 권한 대행",
//   '장은' ← "교육장은". 규칙으로 잡히지 않아 확인된 것만 이름으로 적어 감춘다.
describe("사람 아닌 이름", () => {
  it.each(["권한", "김부", "최부", "장은"])("'%s'는 사람이 아니다", (n) => {
    expect(isAnonymizedName(n)).toBe(true);
  });

  it("비슷하지만 진짜인 이름은 남긴다", () => {
    for (const n of ["김부겸", "권한나", "장은숙", "최부자"]) expect(isAnonymizedName(n)).toBe(false);
  });
});
