// 소리가 멈췄다는 것이 **사람 눈에 닿는 자리**에 있는가.
//
//   2026-11-09: 낭독 생성기가 열흘을 죽어 있었다. 서버 크론은 매일 '⚠ 기사 듣기 죽음' 을
//   정확히 찍고 있었다 — 감지기는 멀쩡했다. 그 경고가 Worker 로그에만 남아 아무에게도
//   닿지 않은 것이 사고의 전부였다. 그래서 여기서 지키는 것은 '감지'가 아니라 '자리'다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const read = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const page = read("src/app/admin/page.tsx");
const banner = read("src/app/admin/audio-health-banner.tsx");

describe("관리자 화면의 소리 경보", () => {
  it("탭 안이 아니라 탭바 **위**에 있다 — 탭을 열어 보는 사람만 보면 로그와 다를 바 없다", () => {
    const at = page.indexOf("<AudioHealthBanner />");
    const tabs = page.indexOf("ADMIN_TABS.map");
    expect(at, "띠를 못 찾았다").toBeGreaterThan(-1);
    expect(at).toBeLessThan(tabs);
  });

  it("멀쩡하면 아무것도 그리지 않는다 — 늘 떠 있는 띠는 사흘이면 안 보인다", () => {
    expect(banner).toMatch(/if \(!lines\.length\) return null;/);
    expect(banner).toMatch(/if \(!s\) return null;/);
  });

  it("'모른다'를 고장으로 읽지 않는다 — ok === false 일 때만 센다", () => {
    expect(banner).toMatch(/health\?\.ok === false/);
    expect(banner).not.toMatch(/!s\.health\?\.ok\b/);
  });

  it("숫자를 적는다 — '문제가 있습니다'로는 아무도 못 움직인다", () => {
    expect(banner).toMatch(/missing/);
    expect(banner).toMatch(/oldestMissingDays/);
  });

  it("죽은 열쇠도 알린다 — 사람이 갈기 전엔 영영 안 된다", () => {
    expect(banner).toMatch(/deadKeys/);
  });

  it("읽는 사람에게 다음 할 일을 준다", () => {
    expect(banner).toMatch(/news-audio\.log/);
  });

  it("스크린리더가 먼저 읽도록 role=alert 다", () => {
    expect(banner).toMatch(/role="alert"/);
  });
});
