import { describe, it, expect } from "vitest";
import { archiveRouter } from "../src/archive/router";

// 2026-11-05 옛날 물가 사고의 회귀 시험 — 라우터를 통째로 불러 확인한다.
//   D1이 흔들린 순간을 '빈 목록 200 + s-maxage=86400'으로 내보내 하루 박제됐었다.
//   규칙: 실패는 503 + no-store. 자료가 있으면 200 + 하루.

/** 모든 조회가 터지는 D1 — 과부하 상황을 흉내낸다. */
const brokenDb = {
  prepare: () => ({
    bind() { return this; },
    all: () => Promise.reject(new Error("D1_ERROR: D1 DB is overloaded.")),
    first: () => Promise.reject(new Error("D1_ERROR: D1 DB is overloaded.")),
  }),
} as unknown as D1Database;

/** 자료가 있는 D1. */
const okDb = (rows: unknown[]) => ({
  prepare: () => ({
    bind() { return this; },
    all: () => Promise.resolve({ results: rows }),
    first: () => Promise.resolve(rows[0] ?? null),
  }),
}) as unknown as D1Database;

const call = (path: string, db: D1Database) =>
  archiveRouter.request(path, {}, { ARCHIVE_DB: db });

const ADS_PATHS = ["/ads/prices", "/ads/years", "/ads?year=1997", "/ads/on-this-day"];

describe("조회가 실패하면 — 옛 광고 네 경로 모두", () => {
  for (const p of ADS_PATHS) {
    it(`${p} 는 200이 아니라 503`, async () => {
      expect((await call(p, brokenDb)).status).toBe(503);
    });
    it(`${p} 는 캐시 금지 — 실패가 박제되지 않게`, async () => {
      expect((await call(p, brokenDb)).headers.get("Cache-Control")).toBe("no-store");
    });
  }
});

describe("자료가 있으면 전처럼 하루 캐시", () => {
  it("/ads/prices 는 200 + s-maxage=86400", async () => {
    const r = await call("/ads/prices", okDb([{ label: "전세", year: 1999, man: 1500 }]));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("public, s-maxage=86400");
    expect(((await r.json()) as { labels: unknown[] }).labels).toHaveLength(1);
  });
  it("/ads/years 도", async () => {
    const r = await call("/ads/years", okDb([{ year: 1997, n: 1200 }]));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("public, s-maxage=86400");
  });
});

describe("정말 비었으면 200이되 1분만 — 빈 표가 하루를 버티지 않게", () => {
  it("/ads/prices", async () => {
    const r = await call("/ads/prices", okDb([]));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("public, s-maxage=60");
  });
  it("/ads/years", async () => {
    const r = await call("/ads/years", okDb([]));
    expect(r.headers.get("Cache-Control")).toBe("public, s-maxage=60");
  });
});
