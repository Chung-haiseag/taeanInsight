// 재생기가 **화면 밖에** 있어야 한다 — 되돌아가면 소리가 또 끊긴다.
//
//   2026-11-08 이전 상태로 돌아가기는 쉽다. web-audio.tsx 안에서 new AudioContext() 한 줄이면
//   다시 '화면 조각이 소리를 들고 있는' 구조가 되고, 기사로 넘어갈 때 소리가 끊긴다.
//   그런데 그 고장은 **시험이 아니라 독자가** 먼저 발견한다(기사 듣기가 두 번 그랬다).
//   그래서 구조 자체를 읽어서 박제한다.
//
//   왜 소스를 읽나: web 의 vitest 는 node 환경이라 .tsx 를 그리지 못한다
//   (vitest.config: environment "node", include ["src/**/*.test.ts"]).
//   재생기의 **규칙**은 player.test.ts 가 진짜로 돌려 본다. 이 파일은 '어디에 사는지'만 본다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** 주석은 걷어 내고 본다 — 설명문에 적힌 낱말이 시험을 통과시켜선 안 된다. */
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("듣는 중 띠는 모든 화면에 깔린다", () => {
  it("뿌리 레이아웃이 AudioDock 을 그린다", () => {
    // 이게 빠지면 소리는 이어지는데 멈출 단추가 없어진다 — 더 나쁜 고장이다.
    const src = code("src/app/layout.tsx");
    expect(src).toMatch(/<AudioDock\s*\/>/);
    expect(src).toMatch(/from "@\/components\/audio\/audio-dock"/);
  });

  it("띠는 레이아웃 마지막 칸에 sticky 로 앉는다 — 바닥글을 덮지 않는다", () => {
    expect(code("src/components/audio/audio-dock.tsx")).toMatch(/sticky bottom-0/);
  });
});

describe("소리는 화면 조각이 들고 있지 않다", () => {
  it("듣기 단추(web-audio.tsx)에는 소리 내는 코드가 없다", () => {
    const src = code("src/components/web-audio.tsx");
    for (const forbidden of ["AudioContext", "createBufferSource", "decodeAudioData", "useState"]) {
      expect(src, `${forbidden} 가 다시 들어왔다 — 화면이 바뀌면 소리가 끊긴다`).not.toContain(forbidden);
    }
  });

  it("듣기 단추는 공용 재생기에서 상태를 받아 쓴다", () => {
    const src = code("src/components/web-audio.tsx");
    expect(src).toMatch(/usePlayerSnapshot\(\)/);
    expect(src).toMatch(/getPlayer\(\)/);
  });

  it("소리 내는 코드는 로더 한 곳에만 있다", () => {
    // AudioContext 를 여러 곳에서 만들면 탭이 가질 수 있는 개수(크롬 6개)를 금방 넘긴다.
    expect(code("src/components/audio/web-audio-loader.ts")).toContain("decodeAudioData");
    expect(code("src/components/audio/player.ts")).not.toContain("AudioContext");
  });
});

describe("재생기는 창 하나에 하나다", () => {
  it("단위 수준 변수에 담아 두고 다시 만들지 않는다", () => {
    // 매번 new AudioPlayer 를 돌려주면 화면마다 제 재생기를 갖게 되고, 들어 올린 뜻이 없어진다.
    const src = code("src/components/audio/singleton.ts");
    expect(src).toMatch(/let inst: AudioPlayer \| null = null/);
    expect(src).toMatch(/inst \?\?= new AudioPlayer/);
  });

  it("자리 알림은 타이머로 돈다 — rAF 는 다른 탭에서 멈춘다", () => {
    const src = code("src/components/audio/singleton.ts");
    expect(src).toContain("setInterval");
    expect(src, "requestAnimationFrame 은 배경 탭에서 얼어 진행바가 멈춘다").not.toContain("requestAnimationFrame");
  });
});
