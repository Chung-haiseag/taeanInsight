import { describe, it, expect } from "vitest";
import { cacheRule } from "../src/lib/cache_headers";

// 2026-11-05 사고: /paper/prices 가 "아직 정리된 시세가 없습니다"로 비어 있었다.
//   자료는 멀쩡했다(3,082건). D1이 잠깐 흔들린 순간 라우터가 `.catch(() => null)` 로
//   삼키고 '빈 목록'을 200 OK + s-maxage=86400 으로 내보냈고, 그 빈 화면이
//   엣지 캐시에 하루 동안 박제됐다. 실패는 사실이 아니다 — 캐시하면 안 된다.
//   (lib/cache.ts 의 TTL 캐시는 처음부터 "실패는 캐시하지 않음" 이었다. 같은 규칙을 HTTP 헤더에도.)

describe("조회가 실패했을 때", () => {
  it("200 빈 목록이 아니라 503을 준다", () => {
    expect(cacheRule({ failed: true, empty: true, maxAge: 86400 }).status).toBe(503);
  });
  it("절대 캐시하지 않는다", () => {
    expect(cacheRule({ failed: true, empty: true, maxAge: 86400 }).cacheControl).toBe("no-store");
  });
  it("자료가 섞여 들어왔어도 실패면 실패다", () => {
    expect(cacheRule({ failed: true, empty: false, maxAge: 86400 }).status).toBe(503);
  });
});

describe("자료가 있을 때", () => {
  it("200에 제 수명대로 캐시한다", () => {
    expect(cacheRule({ failed: false, empty: false, maxAge: 86400 }))
      .toEqual({ status: 200, cacheControl: "public, s-maxage=86400" });
  });
  it("경로마다 다른 수명을 그대로 쓴다", () => {
    expect(cacheRule({ failed: false, empty: false, maxAge: 3600 }).cacheControl)
      .toBe("public, s-maxage=3600");
  });
});

describe("정말 비었을 때 — 사실이긴 하나 오래 담아두진 않는다", () => {
  it("200을 주되", () => {
    expect(cacheRule({ failed: false, empty: true, maxAge: 86400 }).status).toBe(200);
  });
  it("1분만 캐시한다 — 빈 표는 정상이 아니라서 하루를 버티게 두지 않는다", () => {
    expect(cacheRule({ failed: false, empty: true, maxAge: 86400 }).cacheControl)
      .toBe("public, s-maxage=60");
  });
  it("원래 수명이 1분보다 짧으면 그 짧은 쪽을 쓴다", () => {
    expect(cacheRule({ failed: false, empty: true, maxAge: 30 }).cacheControl)
      .toBe("public, s-maxage=30");
  });
});
