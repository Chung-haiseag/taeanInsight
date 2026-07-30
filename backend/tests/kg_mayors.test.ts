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
