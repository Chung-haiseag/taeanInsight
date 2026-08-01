import { describe, it, expect } from "vitest";

import { councilPhotoFor, councilMemberFor, COUNCIL_MEMBERS } from "../src/kg/council_members";

describe("현직 군의원 사진·정보 매핑", () => {
  it("의원 이름으로 공개 사진 URL", () => {
    expect(councilPhotoFor("김영인")).toBe("/api/archive/photo/council/01.jpg");
    expect(councilPhotoFor("최성미")).toBe("/api/archive/photo/council/07.jpg");
  });
  it("공백 다듬기·비의원은 null", () => {
    expect(councilPhotoFor(" 장영숙 ")).toBe("/api/archive/photo/council/02.jpg");
    expect(councilPhotoFor("홍길동")).toBeNull();
    expect(councilPhotoFor("")).toBeNull();
  });
  it("직위·선거구 정보", () => {
    expect(councilMemberFor("김영인")?.role).toBe("의장");
    expect(councilMemberFor("장영숙")?.role).toBe("부의장");
    expect(COUNCIL_MEMBERS.length).toBe(7);
    expect(new Set(COUNCIL_MEMBERS.map((m) => m.photo)).size).toBe(7);
  });
});
