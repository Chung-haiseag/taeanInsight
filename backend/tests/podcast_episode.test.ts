import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";
import { durationFromBytes, parseScript, parseIdxnos, throwbackRanges, yearsAgoLabel } from "@/reports/episode";

// 팟캐스트 mp3는 tools/lib/wav-to-mp3.mjs가 **128kbps CBR**로 굽는다 → 길이가 파일 크기에 그대로 비례한다.
//   실측(2026-11-06): 3,106,947바이트, ffprobe 194.11초. 16,000바이트/초로 나누면 194.18초 — 오차 0.04%.
//   그래서 지난 20회차의 길이를 재생해 보지 않고도 정직하게 적을 수 있다(R2 head 한 번).
describe("durationFromBytes — 128kbps CBR이라 파일 크기가 길이다", () => {
  it("실측 표본과 맞는다", () => {
    expect(durationFromBytes(3_106_947)).toBe(194);
  });
  it("모르면 지어내지 않는다 — null은 화면에서 조용히 빠진다", () => {
    expect(durationFromBytes(null)).toBe(null);
    expect(durationFromBytes(undefined)).toBe(null);
    expect(durationFromBytes(0)).toBe(null);
  });
  it("1초도 안 되는 크기는 길이로 쓰지 않는다 — 깨진 업로드다", () => {
    expect(durationFromBytes(1000)).toBe(null);
  });
});

describe("parseScript — 저장된 대담 대본", () => {
  it("두 진행자의 줄을 순서대로 읽는다", () => {
    expect(parseScript('[{"sp":"A","text":"안녕하세요"},{"sp":"B","text":"네, 반갑습니다"}]')).toEqual([
      { sp: "A", text: "안녕하세요" },
      { sp: "B", text: "네, 반갑습니다" },
    ]);
  });
  it("없거나 깨진 값은 빈 대본 — 대본 칸이 사라질 뿐 화면이 죽지 않는다", () => {
    expect(parseScript(null)).toEqual([]);
    expect(parseScript(undefined)).toEqual([]);
    expect(parseScript("")).toEqual([]);
    expect(parseScript("{깨진 json")).toEqual([]);
    expect(parseScript('{"sp":"A","text":"x"}')).toEqual([]); // 배열이 아니다
  });
  it("A도 B도 아닌 화자, 빈 줄은 버린다", () => {
    expect(parseScript('[{"sp":"C","text":"x"},{"sp":"A","text":"  "},{"sp":"B","text":"좋아요"}]')).toEqual([
      { sp: "B", text: "좋아요" },
    ]);
  });
});

// 이 회차가 **실제로 다룬** 기사 번호. 비어 있으면 '그 주 주요 기사'로 폴백하고
//   화면의 제목도 바꾼다(지난 20회차는 대본을 버렸기 때문 — 거짓으로 '다룬 기사'라 적지 않는다).
describe("parseIdxnos — 그 회차가 실제로 다룬 기사 번호", () => {
  it("숫자 배열을 읽는다", () => {
    expect(parseIdxnos("[68301,68302]")).toEqual([68301, 68302]);
  });
  it("문자로 들어온 숫자도 받는다", () => {
    expect(parseIdxnos('["68301"]')).toEqual([68301]);
  });
  it("없거나 깨졌으면 빈 목록 — 폴백 여부는 부르는 쪽이 정한다", () => {
    expect(parseIdxnos(null)).toEqual([]);
    expect(parseIdxnos("[]")).toEqual([]);
    expect(parseIdxnos("아무말")).toEqual([]);
  });
  it("0·음수·숫자가 아닌 것은 버린다 — idxno는 양의 정수다", () => {
    expect(parseIdxnos('[0,-5,"x",null,68301]')).toEqual([68301]);
  });
  it("같은 기사가 두 번 들어오면 한 번만", () => {
    expect(parseIdxnos("[68301,68301,68302]")).toEqual([68301, 68302]);
  });
});

// ── 라우트 등록 순서 ────────────────────────────────────────────────────────
// Hono는 먼저 등록된 라우트가 이긴다. `/:weekId` 를 `/:weekId/episode` 보다 먼저 두면
//   'episode'가 주차 이름으로 먹혀 404가 되는데, **빌드도 타입체크도 통과한다** —
//   조용히 깨지는 종류라 시험으로 박제한다. (/:weekId/news 가 같은 이유로 앞에 있다.)
describe("회차 라우트는 /:weekId 보다 먼저 등록된다", () => {
  const src = readFileSync(join(process.cwd(), "src/reports/router.ts"), "utf8");
  it("episode 와 news 가 둘 다 /:weekId 앞에 있다", () => {
    const episode = src.indexOf('reportsRouter.get("/:weekId/episode"');
    const news = src.indexOf('reportsRouter.get("/:weekId/news"');
    const bare = src.indexOf('reportsRouter.get("/:weekId",');
    expect(episode).toBeGreaterThan(-1);
    expect(news).toBeGreaterThan(-1);
    expect(bare).toBeGreaterThan(-1);
    expect(episode).toBeLessThan(bare);
    expect(news).toBeLessThan(bare);
  });
});

// podcast_scripts 는 077 마이그레이션으로 생긴다. 적용 전(또는 로컬 D1)에는 **테이블이 없어서
//   질의가 던진다** — 그 던짐을 받지 않으면 회차 화면 전체가 500이 된다. 폴백이 있어야 한다.
describe("저장된 대본이 없는 환경에서도 회차 화면은 뜬다", () => {
  const src = readFileSync(join(process.cwd(), "src/reports/router.ts"), "utf8");
  it("podcast_scripts 질의를 try/catch로 감싼다", () => {
    const i = src.indexOf("FROM podcast_scripts");
    expect(i).toBeGreaterThan(-1);
    // 질의 앞 400자 안에 try 가 있어야 한다(같은 블록).
    expect(src.slice(Math.max(0, i - 400), i)).toMatch(/try\s*\{/);
  });
});

// ── 옛 기사(throwback) 한 줄 ──────────────────────────────────────────────
//   당진의 기억은 기사 목록 아래 '33년 · 가을에-김정환 1993' 한 줄을 둔다 — 33년 전 같은 주의 기사다.
//   우리 전자북은 1990~2001(49,449건)이라 같은 걸 할 수 있다.
//
//   ⚠ 쿼리 모양을 여기서 정하는 이유: substr(published_at,6,5) 로 거르면 인덱스를 못 타
//     50,522행을 읽는다. 연도별 날짜 구간을 OR 로 묶으면 idx_archive_published 를 타고
//     2,158행이다(실측). 그래서 구간을 만드는 일을 순수 함수로 꺼냈다.
describe("throwbackRanges — 옛 기사를 찾을 연도별 날짜 구간", () => {
  it("2026-W45(11/2~11/8)는 1990~2001 열두 해의 같은 날짜 구간을 만든다", () => {
    const rs = throwbackRanges("2026-W45");
    expect(rs).toHaveLength(12);
    expect(rs[0]).toEqual({ start: "1990-11-02", end: "1990-11-09" }); // end 는 **열린 끝**
    expect(rs[11]).toEqual({ start: "2001-11-02", end: "2001-11-09" });
  });
  it("해를 넘는 주차도 구간이 끊기지 않는다 — 2026-W01 은 12/29~1/4", () => {
    const rs = throwbackRanges("2026-W01");
    expect(rs[0]).toEqual({ start: "1990-12-29", end: "1991-01-05" });
  });
  it("회차보다 나중 해는 넣지 않는다", () => {
    for (const r of throwbackRanges("2026-W45")) expect(r.start < "2026").toBe(true);
  });
  it("모르는 주차면 빈 배열 — 아무 기사나 끌어오지 않는다", () => {
    expect(throwbackRanges("2025-W53")).toEqual([]);
    expect(throwbackRanges("헛소리")).toEqual([]);
    expect(throwbackRanges("")).toEqual([]);
  });
});

describe("yearsAgoLabel — 몇 년 전인가", () => {
  it("1990년 기사를 2026년 회차에서 보면 36년", () => {
    expect(yearsAgoLabel("1990-11-05T00:00:00+09:00", "2026-W45")).toBe("36년");
  });
  it("같은 해면 빈 문자열 — '0년 전'이라고 적지 않는다", () => {
    expect(yearsAgoLabel("2026-01-02", "2026-W45")).toBe("");
  });
  it("날짜를 못 읽으면 빈 문자열", () => {
    expect(yearsAgoLabel("", "2026-W45")).toBe("");
    expect(yearsAgoLabel("1990-11-05", "헛소리")).toBe("");
  });
});
