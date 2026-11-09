// 깨진 사진을 **하이드레이트 전에 실패한 것까지** 잡는가.
//
//   2026-11-07 실측: 기사 머리 사진이 `complete=true, naturalWidth=0`(=받아 보고 실패) 인데도
//   깨진 상자가 그대로 남아 있었다. <img onError> 만 달아 두면 못 잡는다 — 서버가 그려 보낸
//   <img> 는 React 가 손을 대기 전에 실패할 수 있고, 그 error 는 핸들러가 붙기 전에 지나간다.
//   MosaicPhoto 는 2026-11-07 에 고쳤는데 기사 화면은 그대로였다 — 같은 판정을 두 군데에
//   손으로 적어 둔 탓이다. 이제 use-broken-image.ts 한 군데다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const read = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const hook = read("src/components/use-broken-image.ts");
const photo = read("src/components/article-photo.tsx");
const mosaic = read("src/components/reports/mosaic-photo.tsx");
const article = read("src/app/news/[id]/article-client.tsx");

describe("깨진 사진 판정", () => {
  it("마운트 때 complete && naturalWidth === 0 을 직접 묻는다", () => {
    expect(hook).toMatch(/complete/);
    expect(hook).toMatch(/naturalWidth === 0/);
    expect(hook).toMatch(/useEffect/);
  });

  it("onError 도 함께 단다 — 나중에 실패하는 사진은 그쪽으로 잡힌다", () => {
    expect(hook).toMatch(/onError/);
  });
});

describe("쓰는 쪽", () => {
  it.each([
    ["article-photo.tsx", photo],
    ["mosaic-photo.tsx", mosaic],
  ])("%s 는 공용 판정을 쓴다 — 손으로 적으면 한쪽만 고쳐진다", (_n, src) => {
    expect(src).toMatch(/useBrokenImage/);
    expect(src).not.toMatch(/naturalWidth/);
  });

  it("기사 화면에 style.display='none' 로 숨기던 옛 방식이 남아 있지 않다", () => {
    expect(article).not.toMatch(/display\s*=\s*["']none["']/);
  });

  it("기사 화면의 사진은 전부 공용 컴포넌트를 거친다", () => {
    expect(article).toMatch(/<ArticlePhoto/);
    expect(article).toMatch(/<ThumbPhoto/);
    // 남은 <img> 가 있으면 그 자리는 또 깨진 채로 남는다.
    expect(article.match(/<img\b/g) ?? [], "맨 <img> 가 남아 있다").toHaveLength(0);
  });

  it("사진이 깨지면 사진설명도 같이 접는다 — 없는 사진을 설명하는 글만 남으면 더 이상하다", () => {
    expect(photo).toMatch(/if \(broken\) return null;/);
    expect(photo).toMatch(/figcaption/);
  });
});
