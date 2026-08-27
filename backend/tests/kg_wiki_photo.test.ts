import { describe, it, expect } from "vitest";
import { isWikiPhotoAllowed } from "../src/kg/people";

// 위키 사진은 **이름만 맞으면** 붙던 것이 사고였다. 태안 소원면 주민자치위원장 '박정희'에게
//   전직 대통령 얼굴이 걸렸다(2026-08-27 실측). 승인된 인물에게만 붙는다.
function fakeDb(rows: Record<string, unknown[]>) {
  return {
    prepare(sql: string) {
      const key = sql.includes("kg_wiki_photo_ok") ? "photo_ok" : "suppressed";
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) { bound = args; return this; },
        async first() { return (rows[key] ?? []).includes(bound[0]) ? { x: 1 } : null; },
      };
    },
  } as unknown as D1Database;
}

describe("위키 사진 승인 게이트", () => {
  it("승인 안 된 지역 인물에게는 사진을 붙이지 않는다", async () => {
    const db = fakeDb({ suppressed: ["person:문재인"], photo_ok: ["person:김태흠"] });
    expect(await isWikiPhotoAllowed(db, "person:박정희")).toBe(false);
  });

  it("전국 인물 억제 목록에 있으면 붙인다", async () => {
    const db = fakeDb({ suppressed: ["person:문재인"], photo_ok: [] });
    expect(await isWikiPhotoAllowed(db, "person:문재인")).toBe(true);
  });

  it("사진만 따로 승인한 지역 정치인에게도 붙인다", async () => {
    const db = fakeDb({ suppressed: [], photo_ok: ["person:김태흠"] });
    expect(await isWikiPhotoAllowed(db, "person:김태흠")).toBe(true);
  });

  it("표가 없어도(마이그레이션 전) 터지지 않고 안 붙인다", async () => {
    const db = { prepare() { throw new Error("no such table"); } } as unknown as D1Database;
    expect(await isWikiPhotoAllowed(db, "person:박정희")).toBe(false);
  });
});

// ── 전국 인물은 지역 인물의 '함께 등장'에서 뺀다 ────────────────────────────
// 소원면 주민자치위원장 '박정희' 페이지에 "함께 등장 이승만·박근혜·전두환"이 떴다.
//   대통령·당대표는 칼럼·역사 인용으로 아무 기사에나 나와서 바이라인 기자와 똑같은 잡음 허브다.
import { nationalToExclude } from "../src/kg/people";

describe("전국 인물 제외", () => {
  const national = new Set(["person:문재인", "person:박근혜", "person:전두환"]);

  it("지역 인물이 가운데면 전국 인물을 모두 뺀다", () => {
    expect(nationalToExclude(national, "person:박정희")).toEqual(national);
  });

  it("전국 인물 본인 페이지에서는 빼지 않는다 — 서로가 유일한 관계다", () => {
    expect(nationalToExclude(national, "person:문재인").size).toBe(0);
  });
});

// ── 같은 이름의 다른 인물 ────────────────────────────────────────────────
// 한 노드에 두 사람이 섞여 있던 '박정희'를 지역/전국으로 쪼갰다(114건 + 58건).
//   지역지라 지역 인물이 본문의 주인공이고, 전국 인물은 옆 카드로 잇는다.
import { qualifierOf, sortSameName } from "../src/kg/people";

describe("같은 이름 카드", () => {
  it("attrs에서 갈래 이름을 꺼낸다", () => {
    expect(qualifierOf('{"qualifier":"전 대통령"}')).toBe("전 대통령");
  });

  it("attrs가 없거나 깨져도 터지지 않는다", () => {
    expect(qualifierOf(null)).toBeNull();
    expect(qualifierOf("{망가진")).toBeNull();
  });

  it("기사 많은 사람이 먼저 — 갈래 이름 없는 쪽도 섞여 정렬된다", () => {
    const rows = [
      { id: "a", name: "박정희", qualifier: "전 대통령", mentions: 58 },
      { id: "b", name: "박정희", qualifier: null, mentions: 114 },
    ];
    expect(sortSameName(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
