// '기사 듣기'는 **미리 만들어 둔 음성이 있을 때만** 보인다.
//
//   2026-11-08 사용자 지시: "기사듣기는 미리 만든 것이 아니면 보여주지도 말고 생성도 하지 말자".
//
//   무엇이 잘못됐었나: 모든 기사에 '기사 듣기' 단추를 그려 놓고, 누르면 503 을 받아
//   "🎧 음성 준비 중 — 곧 자동 생성됩니다"라고 적었다. **옛 기사엔 거짓말이다.**
//   생성기(tools/news-audio/gen-news-audio.mjs)는 `ORDER BY published_at DESC LIMIT`,
//   곧 최신 기사만 만든다. 2003년 기사는 기다려도 안 생긴다(서버에 온디맨드 생성 경로도 없다).
//   화면 위쪽에서 '듣기'를 본 어르신이 눌렀다가 "준비 중"을 보고 다시 오는 일이 반복된다.
//
//   그래서 서버가 먼저 답한다 — `/api/archive/:idxno` 가 `hasAudio` 를 싣고(R2 에 파일이
//   있는지만 본다. 만들지 않는다), 화면은 **그리기 전에** 안다. 첫 렌더부터 없으면 없다.
//
//   ⚠ '오디오' 단추(링크·임베드 복사)도 같이 숨긴다 — 없는 음성의 주소를 복사해 주면
//     붙여 넣은 곳에서 503 이 난다. 같은 조건으로 묶어 둔다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const ARTICLE = "src/app/news/[id]/article-client.tsx";
const READER = "src/app/news/[id]/reader.ts";
const ARCHIVE_API = "src/lib/api/archive.ts";

/** `function <name>` 부터 다음 최상위 `\n}` 까지 */
function fnBody(src: string, name: string): string {
  const i = src.indexOf(`function ${name}`);
  if (i < 0) return "";
  const j = src.indexOf("\n}\n", i);
  return src.slice(i, j < 0 ? undefined : j);
}

describe("미리 만든 음성이 없으면 '기사 듣기'를 그리지 않는다", () => {
  it("NewsAudio 가 hasAudio 조건 뒤에 있다", () => {
    const line = code(ARTICLE).split("\n").find((l) => l.includes("<NewsAudio"));
    expect(line, "NewsAudio 사용처를 못 찾았다").toBeTruthy();
    expect(line).toMatch(/article\.hasAudio\s*&&/);
  });

  it("'오디오'(링크·임베드) 단추도 같은 조건으로 숨는다", () => {
    const src = code(ARTICLE);
    const bar = fnBody(src, "ShareBar");
    expect(bar, "ShareBar 를 못 찾았다").toBeTruthy();
    expect(bar).toMatch(/오디오/);
    expect(bar).toMatch(/hasAudio\s*&&/);
    // 기사 화면이 그 값을 실제로 넘겨야 의미가 있다
    const use = src.split("\n").find((l) => l.includes("<ShareBar"));
    expect(use).toMatch(/hasAudio=/);
  });
});

describe("hasAudio 는 서버가 정한다 — 화면이 지어내지 않는다", () => {
  it("reader 가 아카이브 응답의 hasAudio 를 그대로 받는다", () => {
    expect(code(READER)).toMatch(/hasAudio:\s*a\.hasAudio === true/);
  });

  it("ArchiveArticle 타입에 hasAudio 가 있다", () => {
    expect(code(ARCHIVE_API)).toMatch(/hasAudio\?:\s*boolean/);
  });

  it("아카이브에 없는 RSS 기사는 hasAudio:false — 낭독은 아카이브 기사만 만든다", () => {
    const src = code(ARTICLE);
    const i = src.indexOf('source: "rss"');
    expect(i, 'RSS 폴백을 못 찾았다').toBeGreaterThan(-1);
    expect(src.slice(i, i + 200)).toMatch(/hasAudio:\s*false/);
  });
});
