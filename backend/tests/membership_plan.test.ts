import { describe, it, expect } from "vitest";
import { TERMS, termOf, orderCode, isMember, extendUntil, MEMBER_PLAN } from "../src/membership/plan";

const at = (s: string) => new Date(s);

describe("요금제 — 하나의 멤버십, 기간만 고른다", () => {
  it("월 9,900원 · 12개월은 두 달 무료", () => {
    expect(termOf(1)?.amount).toBe(9_900);
    expect(termOf(12)?.amount).toBe(99_000);
    expect(termOf(12)!.amount).toBe(9_900 * 10);   // 12개월 값으로 10개월치
  });
  it("정해진 기간만 받는다 — 임의 개월은 거절", () => {
    expect(termOf(3)).toBeNull();
    expect(termOf(0)).toBeNull();
    expect(termOf(-1)).toBeNull();
    expect(termOf(1.5)).toBeNull();
  });
  it("두 가지뿐", () => {
    expect(TERMS.map((t) => t.months)).toEqual([1, 12]);
  });
});

describe("주문번호 — 전화로 불러줄 수 있어야 한다", () => {
  it("연·월이 들어가 언제 것인지 보인다", () => {
    expect(orderCode(at("2026-08-25T10:00:00+09:00"), () => 0)).toMatch(/^TA-2608-/);
  });
  it("헷갈리는 글자(0·O·1·I)를 쓰지 않는다 — 전화로 받아적다 틀린다", () => {
    // 난수를 0~1 전 구간으로 훑어 나오는 모든 글자를 확인한다.
    for (let i = 0; i < 200; i++) {
      const tail = orderCode(at("2026-08-25T10:00:00+09:00"), () => i / 200).split("-")[2];
      expect(tail).toMatch(/^[ACDEFGHJKLMNPQRTUVWXY34679]{4}$/);
    }
  });
  it("난수가 다르면 다른 번호", () => {
    const a = orderCode(at("2026-08-25T10:00:00+09:00"), () => 0.1);
    const b = orderCode(at("2026-08-25T10:00:00+09:00"), () => 0.7);
    expect(a).not.toBe(b);
  });
});

describe("자격 판정 — 돈 낸 사람만, 기간 안에만", () => {
  const now = at("2026-08-25T00:00:00Z");
  it("무료 회원은 아니다", () => {
    expect(isMember({ plan: "free", plan_until: "2099-01-01T00:00:00Z" }, now)).toBe(false);
  });
  it("기간이 남아 있으면 회원", () => {
    expect(isMember({ plan: MEMBER_PLAN, plan_until: "2026-09-25T00:00:00Z" }, now)).toBe(true);
  });
  it("기간이 지났으면 아니다 — 이게 없으면 한 번 결제로 영원히 열린다", () => {
    expect(isMember({ plan: MEMBER_PLAN, plan_until: "2026-08-24T23:59:59Z" }, now)).toBe(false);
  });
  it("만료일이 없으면 무기한 — 관리자가 손으로 준 등급(기관·제휴)", () => {
    expect(isMember({ plan: "org", plan_until: null }, now)).toBe(true);
  });
  it("값이 비어 있으면 아니다", () => {
    expect(isMember({}, now)).toBe(false);
    expect(isMember({ plan: null, plan_until: null }, now)).toBe(false);
  });
});

describe("기간 연장 — 미리 넣은 돈이 사라지면 안 된다", () => {
  const now = at("2026-08-25T00:00:00Z");
  it("아직 남아 있으면 그 끝에서 이어 붙인다", () => {
    // 9월 25일까지 남은 사람이 1개월 더 → 10월 25일. 8월에서 세면 한 달을 잃는다.
    expect(extendUntil("2026-09-25T00:00:00Z", 1, now)).toBe("2026-10-25T00:00:00.000Z");
  });
  it("이미 끝났으면 오늘부터 센다", () => {
    expect(extendUntil("2026-01-01T00:00:00Z", 1, now)).toBe("2026-09-25T00:00:00.000Z");
  });
  it("처음이면 오늘부터", () => {
    expect(extendUntil(null, 12, now)).toBe("2027-08-25T00:00:00.000Z");
  });
  it("말일은 다음 달 말일로 — 1월 31일 + 1개월이 3월로 튀지 않는다", () => {
    expect(extendUntil("2026-01-31T00:00:00Z", 1, at("2026-01-20T00:00:00Z"))).toBe("2026-02-28T00:00:00.000Z");
  });
});
