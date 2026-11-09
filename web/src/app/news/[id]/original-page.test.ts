// 옛 기사(전자북)의 '원본 지면'은 **처음부터 펴져 있어야 한다**.
//
//   2026-11-08 사용자 지적: "지면보기는 기본으로 볼 수 있도록 하자".
//   본문 위에 "옛 지면을 글자로 옮기는 과정이 완벽하지 않습니다. 정확한 내용은 아래 원본
//   지면에서 확인하세요"라고 적어 두고, 정작 그 지면은 접어 놓고 '펼치기'를 눌러야 했다.
//   확인하라고 해 놓고 숨긴 셈이다 — OCR 본문이 틀릴 수 있다는 걸 아는 화면에서
//   원본은 기본값이어야 한다.
//
//   ⚠ 접어 둔 데에는 이유가 있었다(열 때만 받는다). 지면 스캔은 634KB(1081×1600)다.
//     그래도 괜찮은 이유: <img loading="lazy"> 라 **화면에 들어올 때까지 안 받는다.**
//     이 칸은 본문 아래에 있어, 거기까지 내려간 독자는 어차피 보려던 사람이다.
//     그래서 '기본 펴짐'과 'lazy' 는 **함께** 지켜야 한다 — lazy 가 빠지면 모든 옛 기사
//     화면이 열자마자 634KB 를 받는다.
//
//   왜 소스를 읽어 박제하나: web vitest 는 node 환경이라 .tsx 를 그리지 못한다
//   (vitest.config: environment "node", include ["src/**/*.test.ts"]).
//   기본값 한 글자는 조용히 되돌아가기 쉬운 자리라, 읽어서라도 못을 박는다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ARTICLE = "src/app/news/[id]/article-client.tsx";
const ZOOM = "src/components/zoom-pan-image.tsx";

describe("원본 지면은 기본으로 펴져 있다", () => {
  it("OriginalPage 의 open 초기값이 true 다", () => {
    const src = read(ARTICLE);
    const i = src.indexOf("function OriginalPage");
    expect(i, "OriginalPage 를 못 찾았다").toBeGreaterThan(-1);
    const body = src.slice(i, i + 700);
    expect(body).toMatch(/const \[open, setOpen\] = useState\(true\)/);
  });

  it("그래도 접을 수 있다 — 토글 단추는 남아 있다", () => {
    // 늘 펴 두기만 하면 좁은 화면에서 본문·관련뉴스로 내려가는 길이 길어진다.
    const src = read(ARTICLE);
    const i = src.indexOf("function OriginalPage");
    const body = src.slice(i, i + 1400);
    expect(body).toMatch(/setOpen\(!open\)/);
    expect(body).toMatch(/접기/);
  });
});

describe("기본으로 펴는 대신 게으르게 받는다", () => {
  it("지면 이미지에 loading=lazy 가 걸려 있다", () => {
    // 이게 빠지면 모든 옛 기사 화면이 열자마자 634KB 를 받는다.
    expect(read(ZOOM)).toMatch(/<img[^>]*loading="lazy"/);
  });
});
