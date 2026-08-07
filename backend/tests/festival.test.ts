import { describe, it, expect } from "vitest";
import { extractFestivalNames, normalizeFestival } from "../src/kg/festival";

describe("normalizeFestival", () => {
  it("제N회·연도·공백 제거", () => {
    expect(normalizeFestival("제28회 해삼축제")).toBe("해삼축제");
    expect(normalizeFestival("28회 자염축제")).toBe("자염축제");
    expect(normalizeFestival("회사구축제")).toBe("사구축제");
    expect(normalizeFestival("해삼축제")).toBe("해삼축제");
  });
});

describe("extractFestivalNames", () => {
  it("실재 축제명 추출(정규화)", () => {
    const r = extractFestivalNames("올해 제28회 해삼축제와 자염축제가 열렸다. 사구축제도 개최.");
    expect(r).toContain("해삼축제");
    expect(r).toContain("자염축제");
    expect(r).toContain("사구축제");
  });

  it("이미 시드된 대표축제는 제외(중복 방지)", () => {
    expect(extractFestivalNames("제20회 태안튤립축제 개막")).toEqual([]);
    expect(extractFestivalNames("튤립축제와 대하축제")).toEqual([]);
  });

  it("일반명(노이즈)은 제외", () => {
    expect(extractFestivalNames("올해 문화축제와 거리축제, 지역축제")).toEqual([]);
  });

  it("연도 접두도 처리", () => {
    const r = extractFestivalNames("2019 태안군수산물대축제 성황");
    expect(r).toContain("태안군수산물대축제");
  });

  it("중복 제거", () => {
    const r = extractFestivalNames("해삼축제 해삼축제 또 해삼축제");
    expect(r.filter((x) => x === "해삼축제").length).toBe(1);
  });

  it("빈 입력 안전", () => {
    expect(extractFestivalNames("")).toEqual([]);
  });
});
