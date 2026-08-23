import { describe, it, expect } from "vitest";
import { adScore } from "@/archive/ad_filter";

// 아래 제목·본문은 2026-08-24 D1에서 그대로 가져온 실제 값이다.
const A = (section: string, title: string, body: string) => ({ section, title, body });

describe("광고로 봐야 하는 것", () => {
  it("부동산 매물 — 짧고 전화번호가 있다", () => {
    expect(adScore(A("지면 12면", "태안읍 동문리 3구 현대연립 다동 3호", "전세 2,500만원 T.674-2907 675-3177")).ad).toBe(true);
    expect(adScore(A("지면 12면", "남문리 태화빌라 30평형 매매가 5,000만원", "■남문리 태화빌라 30평형 매매가 5,000만원")).ad).toBe(true);
  });

  it("구인 광고", () => {
    expect(adScore(A("지면 12면", "구인", "남문웨딩홀내 미용실 미용사 모집 T. (0451) 631-0709")).ad).toBe(true);
    expect(adScore(A("지면 12면", "청송식당 주방아줌마 구함", "청송식당 주방아줌마 구함 675-2672")).ad).toBe(true);
  });

  // ⚠ 광고는 12·13면에만 있지 않다. 면 번호로 자르면 이것들을 놓친다.
  it("다른 면에 실린 광고도 잡는다", () => {
    expect(adScore(A("지면 01면", "허내과", "외곽도로\nT.674-8649")).ad).toBe(true);
    expect(adScore(A("지면 01면", "미래조명", "벌레잡는 살충기 판매 대·중·소 미래조명 TEL 665-1001~3")).ad).toBe(true);
    expect(adScore(A("지면 08면", "삼성화재 광고", "SAMSUNG\n삼성화재\nTEL 675-6064/675-6065")).ad).toBe(true);
    expect(adScore(A("지면 08면", "그린빌라", "방 2칸, 욕실, 주방 기름보일러, 씽크대\n주차장 완비")).ad).toBe(true);
  });
});

describe("기사로 지켜야 하는 것", () => {
  // 기사체 종결어미가 있으면 기자가 쓴 글이다.
  it("짧은 기사도 지킨다", () => {
    expect(adScore(A("지면 03면", "연탄가스 안전사고 예방",
      "태안군은 연탄사용 성기를 맞이하여 가스누출 안전진단을 실시한다")).ad).toBe(false);
    expect(adScore(A("지면 10면", "조항일 태안중·고교 교장퇴임식",
      "조항일 태안중고등학교 교장 퇴임식이 9일 태안중고등학교 강당에서 거행됐다")).ad).toBe(false);
    expect(adScore(A("지면 11면", "태안군 볼링협회장에 문광선씨 선임",
      "태안군 볼링협회장에 문광선(남면 화양주유소 대표.41세)씨가 선임됐다")).ad).toBe(false);
  });

  // ⚠ 12면에도 진짜 글이 있다. 면으로 뭉텅이 자르면 이것들이 사라진다.
  it("광고면에 실린 칼럼·기사를 지킨다", () => {
    expect(adScore(A("지면 12면", "마음의 등불", "1. 이이(李珥)\n공이 죽자 3년 복을 입었으므로 서모가 감동하여 깨달았다. " + "가".repeat(600))).ad).toBe(false);
    expect(adScore(A("지면 12면", "백혈병 투병 강윤지양 돕기 활발",
      "5월은 가정의 달이라 부르고 있다. 가정을 가꾸고 가정을 건강하고 건전하게 지키자는 의미로 " + "가".repeat(600) + " 밝혔다")).ad).toBe(false);
  });

  it("문의 전화가 붙은 행사 안내 기사는 지킨다", () => {
    // 전화번호만으로 자르면 이런 것이 광고가 된다 — 기사체 종결어미가 되돌린다.
    expect(adScore(A("지면 03면", "태안군 농촌지도소 여성위안문화강좌",
      "태안군 농촌지도소(소장 권기)는 지난달 30일 생활개선회원 등 40명을 대상으로 강좌를 열었다. 문의 674-1234")).ad).toBe(false);
  });
});

describe("판단 근거를 함께 낸다", () => {
  // 사람이 표본을 눈으로 확인할 수 있어야 대량 표시를 맡길 수 있다.
  it("왜 그렇게 봤는지 적는다", () => {
    const v = adScore(A("지면 12면", "구인", "미용사 모집 T. 631-0709"));
    expect(v.why.join(" ")).toContain("전화번호");
    expect(v.score).toBeGreaterThanOrEqual(4);
  });

  it("빈 값도 안전하다", () => {
    expect(adScore({}).ad).toBe(false);
    expect(adScore({ title: null, body: null, section: null }).ad).toBe(false);
  });
});

import { adKind, moneyMan } from "@/archive/ad_filter";

describe("광고 갈래", () => {
  it("부동산", () => {
    expect(adKind({ title: "태안초등학교 후문", body: "방1 부엌 기름보일러 전세가 400만원" })).toBe("부동산");
    expect(adKind({ title: "동문리 355-13 임대", body: "방 1, 부엌 1, 보증금 100만원 월 13만원" })).toBe("부동산");
  });

  it("구인", () => {
    expect(adKind({ title: "구인", body: "동양일보사 총무·배달사원 구함" })).toBe("구인");
    expect(adKind({ title: "레스토랑(늑대와 여우)", body: "아르바이트 여자 2명 구함" })).toBe("구인");
  });

  // 부동산 광고에 '판매'가 섞여도 부동산으로 본다 — 앞의 갈래가 먼저 걸린다.
  it("갈래가 겹치면 앞의 것", () => {
    expect(adKind({ title: "가스판매소 하실분", body: "매매가 2,500만원" })).toBe("부동산");
  });

  it("아무 표식도 없으면 기타", () => {
    expect(adKind({ title: "식사류", body: "게국지백반 내장탕 갈비탕" })).toBe("기타");
  });
});

describe("금액 뽑기", () => {
  it("쉼표가 있어도 읽는다", () => {
    expect(moneyMan("전세 1,000만원 매매 2,500만원")).toEqual([1000, 2500]);
  });
  it("띄어쓰기가 달라도 읽는다", () => {
    expect(moneyMan("보증금 100 만 원")).toEqual([100]);
  });
  it("없으면 빈 배열", () => {
    expect(moneyMan("전화문의 674-1234")).toEqual([]);
    expect(moneyMan("")).toEqual([]);
  });
});
