import { describe, it, expect } from "vitest";
import { edgeCacheKey } from "../src/cache/key_normalizer";

// 인물 프로필의 소속 연도를 고쳐 배포했는데, 같은 주소가 옛 값과 새 값을 번갈아 냈다(2026-08-27).
//   Cache API 항목은 colo마다 따로 살아 있고 **배포는 그것을 깨지 않는다**. 최대 15분간
//   고친 화면과 안 고친 화면이 섞여 나온다 — 앞서 관계망 고칠 때도 "동일하게 보인다"의 원인이었다.
describe("엣지 캐시 열쇠에 배포 판번호", () => {
  it("판번호가 다르면 열쇠도 다르다 — 배포하면 저절로 새로 받는다", () => {
    const a = edgeCacheKey("https://api.example.com/x", "v1");
    const b = edgeCacheKey("https://api.example.com/x", "v2");
    expect(a).not.toBe(b);
  });

  it("같은 판번호·같은 주소면 열쇠도 같다", () => {
    expect(edgeCacheKey("https://api.example.com/x", "v1"))
      .toBe(edgeCacheKey("https://api.example.com/x", "v1"));
  });

  it("판번호를 모르면 주소만 쓴다(옛 동작 유지)", () => {
    expect(edgeCacheKey("https://api.example.com/x", undefined)).toBe("https://api.example.com/x");
  });

  it("이미 물음표가 있어도 주소가 깨지지 않는다", () => {
    const k = edgeCacheKey("https://api.example.com/x?a=1", "v9");
    expect(new URL(k).searchParams.get("a")).toBe("1");
    expect(new URL(k).searchParams.get("__v")).toBe("v9");
  });
});
