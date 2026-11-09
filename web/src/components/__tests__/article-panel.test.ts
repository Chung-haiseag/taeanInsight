import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 회차 화면의 읽기 패널이 지켜야 할 것들.
//   vitest 환경이 node 라 .tsx 를 그릴 수 없다 — 원문을 읽어 **약속**을 지킨다.

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const panel = () => code("src/components/reports/article-panel.tsx");
const list = () => code("src/components/reports/episode-articles.tsx");
const article = () => code("src/app/news/[id]/article-client.tsx");

describe("읽기 패널 — 목록에서 바로 연다", () => {
  it("링크를 단추로 바꾸지 않는다 — 검색엔진과 새 탭이 쓰는 길이다", () => {
    expect(list()).toMatch(/href=\{`\/news\/\$\{a\.idxno\}`\}/);
  });

  it("새 탭으로 열려는 클릭은 가로채지 않는다", () => {
    const l = list();
    expect(l).toMatch(/metaKey/);
    expect(l).toMatch(/ctrlKey/);
    expect(l).toMatch(/if \(wantsNewTab\(e\)\) return;/);
  });
});

describe("읽기 패널 — 소리", () => {
  it("두 번째 재생기를 만들지 않는다", () => {
    const p = panel();
    expect(p).not.toMatch(/new Audio\(|<audio/);
    expect(p).toMatch(/getPlayer\(\)/);
    expect(p).toMatch(/usePlayerSnapshot\(\)/);
  });

  it("나오는 게 없으면 조작 줄을 그리지 않는다 — 죽은 단추를 보여 주지 않는다", () => {
    expect(panel()).toMatch(/if \(!snap\.track\) return null;/);
  });
});

describe("읽기 패널 — 정직함", () => {
  it("못 불러오면 그렇게 적는다", () => {
    const p = panel();
    expect(p).toMatch(/st: "fail"/);
    expect(p).toMatch(/불러오지 못했습니다/);
  });

  it("전문이 없으면 없다고 적는다 — 빈 칸으로 두지 않는다", () => {
    expect(panel()).toMatch(/전문은 기사 화면에서/);
  });

  it("기사 화면으로 가는 길이 늘 남아 있다", () => {
    expect(panel()).toMatch(/href=\{`\/news\/\$\{current\.idxno\}`\}/);
  });
});

describe("읽기 패널 — 닫기와 초점", () => {
  it("ESC 로 닫힌다", () => {
    expect(panel()).toMatch(/e\.key === "Escape"/);
  });

  it("뒤 화면 스크롤을 잠그고 되돌린다", () => {
    const p = panel();
    expect(p).toMatch(/document\.body\.style\.overflow = "hidden"/);
    expect(p).toMatch(/document\.body\.style\.overflow = prev/);
  });

  it("닫으면 초점을 눌렀던 자리로 되돌린다", () => {
    expect(panel()).toMatch(/restoreRef\.current\?\.focus\?\.\(\)/);
  });

  it("대화상자로 알린다", () => {
    const p = panel();
    expect(p).toMatch(/role="dialog"/);
    expect(p).toMatch(/aria-modal="true"/);
  });
});

describe("본문 가르는 규칙은 한 군데", () => {
  it("패널과 기사 화면이 같은 모듈을 쓴다", () => {
    expect(panel()).toMatch(/readBody/);
    expect(article()).toMatch(/from "@\/lib\/article-body"/);
  });

  it("어느 쪽도 제 손으로 문단을 쪼개지 않는다", () => {
    for (const [name, src] of [["패널", panel()], ["기사 화면", article()]] as const) {
      expect(src, `${name} 가 문단 쪼개기를 다시 들고 있다`).not.toMatch(/function splitParagraphs/);
    }
  });
});

describe("읽기 패널 — 좁은 화면", () => {
  // ⚠ 이 프로젝트의 sm 은 320px 다(tailwind.config.ts, PRD §7.6). 흔한 640px 이 아니다.
  //   `sm:` 으로 옆 패널 폭을 걸면 휴대폰에서도 걸려 240px 짜리 쪽지가 된다 — 실제로 그랬다.
  it("옆에 나란히 두는 배치는 md(768px)부터다 — sm 으로 걸지 않는다", () => {
    const p = panel();
    expect(p, "sm: 은 320px 라 휴대폰에도 걸린다").not.toMatch(/\bsm:/);
    expect(p).toMatch(/md:w-\[min\(/);
  });

  it("좁은 화면에서는 패널이 화면을 통째로 쓴다", () => {
    // 패널 자체(aside)의 class 한 줄 안에 둘 다 있어야 한다 — 붙어 있을 필요는 없다.
    const cls = panel().match(/className="flex h-full[^"]*"/)?.[0] ?? "";
    expect(cls).toMatch(/\bw-full\b/);
    expect(cls).toMatch(/md:w-\[min\(/);
  });

  it("머리의 단추와 시간이 줄바꿈으로 쪼개지지 않는다", () => {
    const p = panel();
    const nowrap = p.match(/whitespace-nowrap/g) ?? [];
    expect(nowrap.length, "−15 초 · 닫 기 처럼 갈라진다").toBeGreaterThanOrEqual(4);
  });
});
