import { describe, it, expect } from "vitest";
import { inferFestivalLinks } from "../src/kg/festival_links";

describe("inferFestivalLinks", () => {
  it("이름에 박힌 장소·품목·태안주관 추론", () => {
    const r = inferFestivalLinks("백사장대하축제");
    expect(r.place).toBe("place:beach-baeksajang");
    expect(r.commodity).toBe("commodity:daeha");
    expect(r.host).toBeNull(); // '태안' 없음
  });
  it("태안-브랜드는 군청 주관", () => {
    const r = inferFestivalLinks("태안국화축제");
    expect(r.host).toBe("org:taean-gov");
    expect(r.place).toBeNull();
    expect(r.commodity).toBeNull();
  });
  it("만리포·주꾸미", () => {
    const r = inferFestivalLinks("만리포주꾸미축제");
    expect(r.place).toBe("place:beach-mallipo");
    expect(r.commodity).toBe("commodity:jukkumi");
  });
  it("명시 없으면 전부 null(지어내기 방지)", () => {
    const r = inferFestivalLinks("해삼축제");
    expect(r).toEqual({ host: null, place: null, commodity: null });
  });
});
