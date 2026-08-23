import { describe, it, expect } from "vitest";
import { triageFestival, countFestTriage } from "@/kg/festival_triage";

// 아래 이름·근거는 2026-08-23 D1 대기열(166건)에서 그대로 가져온 실제 값이다.
const F = (name: string, ...evidence: string[]) => ({ name, evidence });

describe("타 지역 축제 — 이름이 말해준다", () => {
  it("이름에 다른 시·군이 있으면 타 지역", () => {
    expect(triageFestival(F("보령머드축제", "보령머드축제, 악재로 '파행'운영"))).toBe("타지역");
    expect(triageFestival(F("서산해미읍성축제"))).toBe("타지역");
    expect(triageFestival(F("금산인삼축제", "'99 금산인삼축제"))).toBe("타지역");
  });

  // 태안신문 기사라 근거에 '태안'이 스쳐 지나가는 일이 흔하다.
  //   이름에 타 지역이 박혀 있으면 근거가 뭐라 하든 타 지역이다.
  it("근거에 태안이 있어도 이름이 이기다", () => {
    expect(triageFestival(F("보령머드축제", "태안 주민들이 보령머드축제를 다녀왔다"))).toBe("타지역");
  });
});

describe("축제 이름이 아닌 것", () => {
  // '자염축제 우수축제 선정'에서 '우수축제'를 이름으로 잡았다.
  it("수식어 + 축제는 이름이 아니다", () => {
    expect(triageFestival(F("우수축제", "자염축제 우수축제 선정"))).toBe("이름아님");
    expect(triageFestival(F("이번축제"))).toBe("이름아님");
    expect(triageFestival(F("문화관광축제"))).toBe("이름아님");
    expect(triageFestival(F("향토축제"))).toBe("이름아님");
  });

  it("수식어가 앞에 붙었을 뿐인 진짜 축제는 지킨다", () => {
    // '세계'는 수식어지만 '세계튤립축제'는 실제 축제 이름이다 — 이름 전체가 수식어일 때만 뺀다.
    expect(triageFestival(F("세계튤립축제", "태안 세계튤립축제, 4월부터 28일간 열린다"))).not.toBe("이름아님");
  });
});

describe("태안 축제 — 지명이 근거", () => {
  it("이름에 태안이 있으면 태안", () => {
    expect(triageFestival(F("태안빛축제"))).toBe("태안");
  });

  it("근거에 태안 지명이 있으면 태안", () => {
    expect(triageFestival(F("사구축제", "생태관광 일번지 신두리 해안사구서 사구축제 열린다"))).toBe("태안");
    expect(triageFestival(F("주꾸미축제", "몽산포항 주꾸미축제 개막, 첫날부터 '북적'"))).toBe("태안");
    expect(triageFestival(F("목련축제", "천리포수목원 목련축제, 다채로운 행사에 '기대감'"))).toBe("태안");
    expect(triageFestival(F("벚꽃축제", "이원 벚꽃축제 성료"))).toBe("태안");
  });
});

describe("사람이 봐야 하는 것", () => {
  it("지명이 어디에도 없으면 확인 필요", () => {
    expect(triageFestival(F("튤립꽃축제", "튤립꽃축제 연이은 흥행 예감... 문의폭증"))).toBe("확인필요");
    expect(triageFestival(F("저녁놀축제", "저녁놀축제 화상사고 돕기 성금을 보내주신 분들"))).toBe("확인필요");
  });

  it("근거가 아예 없으면 확인 필요", () => {
    expect(triageFestival(F("딸기축제"))).toBe("확인필요");
  });

  it("빈 이름은 확인 필요", () => {
    expect(triageFestival(F(""))).toBe("확인필요");
  });
});

describe("갈래별 집계", () => {
  it("화면에 '몇 건을 자동으로 갈랐는지' 보여줄 수 있다", () => {
    expect(countFestTriage([
      F("태안빛축제"), F("보령머드축제"), F("우수축제"), F("튤립꽃축제"),
    ])).toEqual({ 태안: 1, 타지역: 1, 이름아님: 1, 확인필요: 1 });
  });
});
