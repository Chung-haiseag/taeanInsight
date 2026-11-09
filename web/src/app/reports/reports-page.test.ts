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

// 2026-11-07: 당진의 기억 구조로 다시 짰다. 되돌아가면 안 되는 것들을 박제한다.
describe("회차 머리 — 당진 구조에서 되돌아가지 않는다", () => {
  // ⚠ 주석을 걷어내고 본다. 처음엔 안 걷어내서 "<details> 안의 글은 주소가 없다"고 **설명하는
  //   주석**을 코드로 읽고 가드가 헛돌았다 — 소스를 읽는 가드는 코드만 읽어야 한다.
  const code = (p: string) =>
    readFileSync(join(process.cwd(), p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const head = () => code("src/components/reports/episode-head.tsx");

  it("대본은 접는 칸이 아니라 제 주소를 가진 화면으로 간다", () => {
    // <details> 안의 글은 공유할 주소가 없고 검색 결과로도 서지 못한다 —
    //   대본을 저장하기로 한 이유(귀가 어두운 독자·검색)가 통째로 무너진다.
    expect(head()).not.toMatch(/<details/);
    expect(head()).toMatch(/\/reports\/\$\{episode\.weekId\}\/script/);
  });

  it("대본 화면이 실제로 있다", () => {
    expect(() => readFileSync(join(process.cwd(), "src/app/reports/[weekId]/script/page.tsx"), "utf8")).not.toThrow();
  });

  it("대본이 없는 회차엔 링크를 그리지 않는다", () => {
    // 지난 21회차는 대본이 없다. 눌러서 404 를 보게 하면 독자는 자기가 잘못 눌렀다고 여긴다.
    expect(head()).toMatch(/episode\.script\.length > 0 &&/);
  });

  it("제목은 사람 말이다 — 번호(제N화)를 제목으로 쓰지 않는다", () => {
    // 번호는 왼쪽에 크게 선다. h1 은 '11월 둘째 주의 태안'처럼 읽혀야 한다.
    //   2026-11-09: h1 이 쓰는 말을 `name` 한 군데로 모았다(지난 회차 화면과 같은 머리를 쓰면서
    //   '이번 주'라는 기본값이 지난 회차에도 붙지 않게). 그래서 h1 이 아니라 그 `name` 을 본다.
    const h1 = /<h1[\s\S]*?<\/h1>/.exec(head())?.[0] ?? "";
    expect(h1, "h1 이 name 을 쓴다").toMatch(/\{name\}/);
    expect(h1).not.toMatch(/episodeNoLabel/);
    const name = /const name = .*/.exec(head())?.[0] ?? "";
    expect(name, "name 은 주차 이름에서 온다").toMatch(/monthWeekLabel|week\b/);
    expect(name).not.toMatch(/episodeNoLabel/);
  });

  it("지난 회차를 '이번 주'라 부르지 않는다", () => {
    // 같은 머리를 /reports/<주차> 에서도 쓴다. 기본값이 '이번 주 팟캐스트'라 latest 를 안 보면 거짓말이 된다.
    const name = /const name = .*/.exec(head())?.[0] ?? "";
    expect(name, "주차 이름을 못 구할 때의 대비책이 latest 를 본다").toMatch(/latest/);
    expect(head(), "'최신 회' 표지도 latest 를 본다").toMatch(/latest \? "최신 회"/);
  });

  it("지난 회차 화면이 같은 머리를 쓴다 — 복사하지 않는다", () => {
    const raw = readFileSync(join(process.cwd(), "src/app/reports/[weekId]/page.tsx"), "utf8");
    // 주석에도 ReportReader 를 언급해 뒀으니 주석을 털고 본다.
    const page = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(page).toMatch(/<EpisodeHead[^>]*latest=\{false\}/);
    // 분석은 최신 주차 기준이라 지난 회차에 붙이면 그 주의 분석인 척하게 된다.
    expect(page, "지난 회차엔 데이터 분석을 붙이지 않는다").not.toMatch(/ReportReader|RequireRole/);
  });

  it("'다시 듣기' 목록의 줄이 그 회차 화면으로 간다", () => {
    const list = readFileSync(join(process.cwd(), "src/components/reports/podcast-episodes.tsx"), "utf8");
    expect(list).toMatch(/href=\{`\/reports\/\$\{e\.weekId\}`\}/);
    // 단추는 남는다 — 목록에서 바로 틀고 싶은 사람을 화면 한 번 더 거치게 하지 않는다.
    expect(list).toMatch(/<WebAudio/);
  });

  it("옛 기사 줄은 있을 때만 그린다", () => {
    // 없는 주차에 '0년 전'이나 빈 줄을 그리면 아카이브가 비어 보인다.
    expect(head()).toMatch(/episode\.throwback &&/);
  });

  it("사진 번호는 목록 순번에서 온다 — 사진 순번이 아니다", () => {
    // 사진 없는 기사가 섞이면 번호가 건너뛴다. 그게 맞다 — 번호는 '목록에서 몇 번째'다.
    expect(head()).toMatch(/\.map\(\(a, i\) => \(\{ \.\.\.a, n: i \+ 1 \}\)\)[\s\S]{0,80}\.filter\(/);
  });
});

// 2026-11-07: 모자이크 사진 한 칸이 빈 회색 상자 + 번호표로 남아 있었다 — 신문사 CDN 에
//   사진이 없는 기사(idxno 69385)였다. 예전 배치에선 96×64 썸네일이라 티가 안 났는데
//   큰 칸이 되니 **우리 쪽이 고장난 것처럼** 보였다. 서버는 그 주소가 사는지 알 수 없다.
describe("깨진 사진은 칸째로 접는다", () => {
  it("모자이크는 onError 를 아는 칸(MosaicPhoto)을 쓴다 — 맨 <img> 를 직접 박지 않는다", () => {
    const head = readFileSync(join(process.cwd(), "src/components/reports/episode-head.tsx"), "utf8");
    expect(head).toMatch(/<MosaicPhoto\b/);
    expect(head).not.toMatch(/<img\b/);
  });
  it("MosaicPhoto 는 깨지면 null 을 돌려준다", () => {
    const m = readFileSync(join(process.cwd(), "src/components/reports/mosaic-photo.tsx"), "utf8");
    expect(m).toMatch(/onError=/);
    expect(m).toMatch(/if \(broken\) return null;/);
  });
});

// onError 만으로는 못 잡는다 — 서버가 그린 <img> 는 React 가 하이드레이트하기 전에 이미 실패할 수
//   있고, 그 이벤트는 핸들러가 붙기 전에 지나간다. 실측으로 확인했다(complete=true·naturalWidth=0
//   인데 빈 칸이 그대로 남았다). 마운트 때 직접 묻는 길이 반드시 있어야 한다.
describe("하이드레이션 전에 깨진 사진도 잡는다", () => {
  it("MosaicPhoto 가 마운트 때 complete·naturalWidth 를 직접 확인한다", () => {
    const m = readFileSync(join(process.cwd(), "src/components/reports/mosaic-photo.tsx"), "utf8");
    expect(m).toMatch(/useEffect\(/);
    expect(m).toMatch(/complete[\s\S]{0,40}naturalWidth === 0/);
  });
});
