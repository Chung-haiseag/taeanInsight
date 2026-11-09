import { describe, expect, it } from "vitest";
import { readBody, splitParagraphs } from "./article-body";

describe("splitParagraphs", () => {
  it("빈 본문은 빈 목록", () => {
    expect(splitParagraphs("")).toEqual([]);
    expect(splitParagraphs("   \n  ")).toEqual([]);
  });

  it("백필이 문단을 보존했으면 그대로 쓴다", () => {
    expect(splitParagraphs("첫 문단.\n\n둘째 문단.\n셋째.")).toEqual(["첫 문단.", "둘째 문단.", "셋째."]);
  });

  it("한 덩어리면 문장 셋씩 묶는다", () => {
    const one = "가나다. 라마바. 사아자. 차카타. 파하.";
    expect(splitParagraphs(one)).toEqual(["가나다. 라마바. 사아자.", "차카타. 파하."]);
  });

  it("문장 부호가 없으면 통째로 한 문단", () => {
    expect(splitParagraphs("끊을 데가 없는 글")).toEqual(["끊을 데가 없는 글"]);
  });
});

describe("readBody — 사진·사진설명·본문 가르기", () => {
  const LONG = "이 문단은 사진설명이라고 보기에는 너무 길다. 마흔다섯 글자를 훌쩍 넘기므로 본문으로 남아야 한다.";

  it("사진이 있고 첫 문단이 짧으면 사진설명으로 뗀다", () => {
    const r = readBody(`태안읍 전경.\n${LONG}\n둘째 문단.`, ["a.jpg"]);
    expect(r.caption).toBe("태안읍 전경.");
    expect(r.paras).toEqual([LONG, "둘째 문단."]);
    expect(r.leadImage).toBe("a.jpg");
  });

  it("사진이 없으면 짧은 첫 문단도 본문이다 — 설명할 사진이 없다", () => {
    const r = readBody(`태안읍 전경.\n${LONG}`, []);
    expect(r.caption).toBeNull();
    expect(r.paras[0]).toBe("태안읍 전경.");
    expect(r.leadImage).toBeNull();
  });

  it("문단이 하나뿐이면 떼지 않는다 — 본문이 통째로 사라진다", () => {
    const r = readBody("짧은 한 줄.", ["a.jpg"]);
    expect(r.caption).toBeNull();
    expect(r.paras).toEqual(["짧은 한 줄."]);
  });

  it("첫 문단이 길면 사진설명이 아니다", () => {
    const r = readBody(`${LONG}\n둘째.`, ["a.jpg"]);
    expect(r.caption).toBeNull();
    expect(r.paras[0]).toBe(LONG);
  });

  it("머리 사진과 나머지 사진을 가른다", () => {
    const r = readBody(LONG, ["a.jpg", "b.jpg", "c.jpg"]);
    expect(r.leadImage).toBe("a.jpg");
    expect(r.restImages).toEqual(["b.jpg", "c.jpg"]);
  });

  it("사진이 없으면 나머지도 없다", () => {
    const r = readBody(LONG, []);
    expect(r.leadImage).toBeNull();
    expect(r.restImages).toEqual([]);
  });

  it("본문이 없어도 사진은 그린다 — 지면 기사엔 전문이 없을 수 있다", () => {
    const r = readBody("", ["a.jpg"]);
    expect(r.paras).toEqual([]);
    expect(r.leadImage).toBe("a.jpg");
    expect(r.caption).toBeNull();
  });
});
