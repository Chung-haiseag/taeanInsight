import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

// 2026-11-07: /reports 를 팟캐스트 회차 화면으로 바꿨다. 결정은 두 가지였다 —
//   **팟캐스트는 공개**, 데이터 분석만 회원 전용. 그런데 이 구조는 조용히 깨진다:
//   RequireRole 을 페이지 전체에 다시 씌우거나 fallback 을 빼면, 비로그인 독자가
//   공개된 팟캐스트를 **보기도 전에** /login 으로 쫓겨난다. 빌드도 타입체크도 통과한다.
//   그래서 소스를 읽어 박제한다(JSX 를 렌더하는 시험 환경이 없다 — vitest environment: node).

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const page = read("src/app/reports/page.tsx");
const reader = read("src/components/reports/report-reader.tsx");
const gate = read("src/components/require-role.tsx");

describe("팟캐스트는 공개다 — 로그인 벽 앞에 두지 않는다", () => {
  it("회차 머리가 등급 가드 밖에 있다", () => {
    const head = page.indexOf("<EpisodeHead");
    const guard = page.indexOf("<RequireRole");
    expect(head).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(head).toBeLessThan(guard);
  });
  it("지난 회차 목록도 가드 밖에 있다", () => {
    expect(page.indexOf("<PodcastEpisodes")).toBeLessThan(page.indexOf("<RequireRole"));
  });
  it("등급 가드는 반드시 fallback 을 받는다 — 없으면 /login 으로 쫓아낸다", () => {
    const m = /<RequireRole[^>]*>/.exec(page);
    expect(m).not.toBeNull();
    expect(m![0]).toContain("fallback=");
  });
  it("가드가 하나뿐이다 — 하나 더 끼우면 그 자리부터 다시 잠긴다", () => {
    expect(page.match(/<RequireRole/g) ?? []).toHaveLength(1);
  });
});

describe("RequireRole — fallback 을 주면 쫓아내지 않는다", () => {
  it("fallback 이 있으면 비로그인도 리다이렉트하지 않는다", () => {
    // 비로그인 분기(!acct) 안에서 fallback 검사가 router.replace 보다 먼저 와야 한다.
    const i = gate.indexOf("if (!acct) {");
    expect(i).toBeGreaterThan(-1);
    const block = gate.slice(i, gate.indexOf("}", gate.indexOf("router.replace", i)));
    expect(block.indexOf("fallback !== undefined")).toBeGreaterThan(-1);
    expect(block.indexOf("fallback !== undefined")).toBeLessThan(block.indexOf("router.replace"));
  });
  it("등급 부족일 때도 fallback 이 기본 안내보다 먼저 쓰인다", () => {
    const fb = gate.indexOf('gate === "denied" && fallback !== undefined');
    const plain = gate.indexOf('if (gate === "denied")\n    return (');
    expect(fb).toBeGreaterThan(-1);
    expect(plain).toBeGreaterThan(-1);
    expect(fb).toBeLessThan(plain);
  });
});

describe("재생기가 한 번만 나온다", () => {
  it("분석 뷰어(ReportReader)에는 팟캐스트가 없다 — 페이지 맨 위로 옮겼다", () => {
    expect(reader).not.toContain("<PodcastAudio");
    expect(reader).not.toContain("<PodcastEpisodes");
  });
});

describe("h1 은 하나다 — 화면 읽기 프로그램이 두 문서로 읽지 않게", () => {
  it("분석 뷰어의 제목은 h2 로 내려갔다", () => {
    expect(reader).not.toMatch(/<h1[\s>]/);
  });
  it("회차 머리가 h1 을 갖는다", () => {
    expect(read("src/components/reports/episode-head.tsx")).toMatch(/<h1[\s>]/);
  });
});

// 회차 조회가 실패하는 갈래(백엔드가 아직 안 올라간 배포 직후가 정확히 이 상태다)에도
//   h1 이 있어야 한다. EpisodeHead 로 h1 을 옮기면서 한때 이 갈래만 h1 이 없었다 —
//   빌드·타입체크·테스트 모두 통과했고, 배포 번들을 띄워 HTML 을 세어 보고서야 드러났다.
describe("어느 갈래로 가도 h1 이 하나 있다", () => {
  it("회차·폴백·발행 전 — 세 갈래 모두 h1 을 그린다", () => {
    const head = readFileSync(join(process.cwd(), "src/components/reports/episode-head.tsx"), "utf8");
    expect(head.match(/<h1[\s>]/g) ?? []).toHaveLength(1); // 회차 갈래
    // 페이지가 직접 그리는 h1 은 폴백 갈래와 '발행 전' 갈래 둘이다.
    expect(page.match(/<h1[\s>]/g) ?? []).toHaveLength(2);
  });
});

// 2026-11-07: 대본을 심고 화면을 띄워 보니 머리가 앞뒤 안 맞는 말을 했다 —
//   "이 회차의 음성은 아직 준비 중입니다" 아래에 "3분 14초"가 같이 적혀 있었다.
//   길이는 **들을 수 있는 음성**을 설명하는 값이다. 재생할 게 없으면 적지 않는다.
//   (R2 head() 가 일시적으로 실패해도 hasAudio=false 가 된다 — router 가 .catch(()=>null) 한다)
describe("들을 수 없는 회차에는 길이를 적지 않는다", () => {
  it("durationLabel 은 hasAudio 를 통과한 뒤에만 쓴다", () => {
    const head = readFileSync(join(process.cwd(), "src/components/reports/episode-head.tsx"), "utf8");
    const m = /const len = ([^;]+);/.exec(head);
    expect(m, "episode-head 에 const len = … 이 없다").not.toBeNull();
    expect(m![1]).toMatch(/hasAudio/);
  });
});
