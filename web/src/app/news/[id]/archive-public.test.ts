// 아카이브 기사(1990~2001 전자북)는 **로그인 없이 그대로 보인다** — 본문·원본 지면 둘 다.
//
//   2026-11-08 사용자 결정("전부 공개"). 그 전까지는 `loggedIn && article.hasFullText` 라
//   비로그인 독자는 발췌 한 토막 + '로그인하면 보입니다' 상자만 봤다.
//
//   왜 문턱이 있었나 — 결제가 아니라 **가입 유도**였다. 게이트 상자 자신이 그렇게 적어
//   뒀다: "아카이브 기사는 회원가입만 하시면 무료입니다. 결제는 필요하지 않습니다."
//   그런데 본문은 이미 서버가 누구에게나 내려주고 있었다(`/api/archive/:idxno` 는 인증을
//   보지 않고, page.tsx 가 그 응답을 initialArticle 로 넘긴다). 문턱은 **그려 주지 않을
//   뿐, 막지는 못했다** — 소스 보기로 다 읽혔다.
//
//   ⚠ 되돌리지 말 것: 되돌리면 1990~2001년 49,449편이 다시 검색에서 사라진다.
//     (문턱이 있는 동안엔 SSR HTML 에도 게이트 상자만 담겨 색인되지 않았다.)
//     코드 주석이 처음부터 그 반대를 노렸다: "아카이브 기사는 무료로 유지한다(유입·검색)".
//
//   ⚠ 단, '틀린 글자 알리기'는 **읽기가 아니라 쓰기**다. 관리자 검토 큐로 들어가므로
//     로그인한 독자만 쓴다 — 익명 기기 id로도 제출이 통과하는 엔드포인트라(identifyUser 가
//     X-Taean-Uid 를 받는다) 화면에서 막아 둔다. 접수 안내도 '내 페이지에서 보세요'라
//     적혀 있어 비로그인에겐 거짓말이 된다.
//
//   왜 소스를 읽어 박제하나: web vitest 는 node 환경이라 .tsx 를 그리지 못한다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// 주석은 떼고 본다 — 이 변경의 '왜'를 적은 주석이 가드에 걸리면 안 된다.
const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const ARTICLE = "src/app/news/[id]/article-client.tsx";

describe("아카이브 전문은 로그인 없이 보인다", () => {
  it("본문 분기가 loggedIn 을 보지 않는다", () => {
    const src = code(ARTICLE);
    expect(src).not.toMatch(/loggedIn\s*&&\s*article\.hasFullText/);
    expect(src).toMatch(/\{article\.hasFullText \?/);
  });

  it("'로그인하면 보입니다' 상자가 사라졌다", () => {
    // 전문이 아직 없는 기사(RSS 발췌만)에 '전문은 로그인하시면 보실 수 있습니다'라고
    // 적는 건 거짓이다 — 로그인해도 없다.
    const src = code(ARTICLE);
    expect(src).not.toMatch(/MemberGate/);
    expect(src).not.toMatch(/로그인하시면 보실 수 있습니다/);
  });

  it("전문이 없으면 누구에게나 같은 안내를 준다", () => {
    const src = code(ARTICLE);
    expect(src).toMatch(/아카이브에 옮겨지면 이 자리에 나옵니다/);
  });
});

describe("틀린 글자 알리기는 로그인해야 쓴다", () => {
  it("CorrectionRequest 가 loggedIn 과 함께 걸려 있다", () => {
    const line = code(ARTICLE)
      .split("\n")
      .find((l) => l.includes("<CorrectionRequest"));
    expect(line, "CorrectionRequest 사용처를 못 찾았다").toBeTruthy();
    expect(line).toMatch(/loggedIn/);
  });
});
