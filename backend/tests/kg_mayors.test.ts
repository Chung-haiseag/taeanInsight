import { describe, it, expect } from "vitest";

import { mayorPhotoFor, mayorInfoFor, MAYORS } from "../src/kg/mayors";

describe("역대 군수 사진·정보 매핑", () => {
  it("현직·전직 군수 이름으로 공개 사진 URL을 돌려준다", () => {
    expect(mayorPhotoFor("윤희신")).toBe("/api/archive/photo/mayor/12.jpg");
    expect(mayorPhotoFor("가세로")).toBe("/api/archive/photo/mayor/11.jpg");
    expect(mayorPhotoFor("조철행")).toBe("/api/archive/photo/mayor/01.jpg");
  });

  it("여러 대 재임한 군수(진태구)도 한 장으로 매핑된다", () => {
    expect(mayorPhotoFor("진태구")).toBe("/api/archive/photo/mayor/08.jpg");
    expect(mayorInfoFor("진태구")?.terms).toContain("12대");
  });

  it("공백을 다듬고, 군수가 아니면 null", () => {
    expect(mayorPhotoFor("  윤희신 ")).toBe("/api/archive/photo/mayor/12.jpg");
    expect(mayorPhotoFor("홍길동")).toBeNull();
    expect(mayorPhotoFor("")).toBeNull();
  });

  it("13대(대수)를 12명(사람)으로 담는다 — 진태구만 중복", () => {
    expect(MAYORS.length).toBe(12);
    expect(new Set(MAYORS.map((m) => m.photo)).size).toBe(12);
  });
});

// 모순 감사(2026-08-28): 공식 명부와 신문 표기가 갈렸다.
//   명부 '유응상'(2대)·'송성현'(5대) ↔ 신문은 '류응상'(군수와 붙은 기사 8건)·'송성헌'(51건).
//   신문 표기 노드가 기사를 다 갖고 있는데 사진·직위가 안 붙었다.
//   ※ '송성현'은 따로 16건 있으나 군수와 붙은 기사가 **0건**이라 동일인이 아니라 다른 사람이다.
describe("역대 군수 — 신문 표기로도 찾아진다", () => {
  it.each(["류응상", "송성헌"])("'%s'로도 공식 사진이 나온다", (n) => {
    expect(mayorPhotoFor(n)).toBeTruthy();
  });

  it("명부 표기도 그대로 찾아진다", () => {
    expect(mayorPhotoFor("유응상")).toBeTruthy();
    expect(mayorPhotoFor("송성현")).toBeTruthy();
  });

  it("군수가 아닌 사람은 여전히 null", () => {
    expect(mayorPhotoFor("김영인")).toBeNull();
  });
});
