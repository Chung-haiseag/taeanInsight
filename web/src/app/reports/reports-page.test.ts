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
  const list = () => code("src/components/reports/episode-articles.tsx");

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
    const page = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    // 2026-11-10: 이 화면은 이제 **최신호를 맨 위에** 열어 둔다(latest={false} 는 사라졌다).
    //   지키는 것은 그대로다 — 머리를 베끼지 않고, 분석을 붙이지 않는다.
    expect(page).toMatch(/<EpisodeHead\b/);
    expect(page, "머리를 직접 그리기 시작하면 두 화면이 서서히 달라진다").not.toMatch(/<h1[\s>]/);
    // 분석은 회원 전용 읽을거리고 이 화면은 '무슨 이야기를 했나'까지다. 분석은 /reports 에 있다.
    expect(page, "지난 회차얼 데이터 분석을 붙이지 않는다").not.toMatch(/ReportReader|RequireRole/);
  });

  it("'다시 듣기' 목록의 줄이 그 회차 화면으로 간다", () => {
    const list = readFileSync(join(process.cwd(), "src/components/reports/podcast-episodes.tsx"), "utf8");
    expect(list).toMatch(/href=\{`\/reports\/\$\{e\.weekId\}`\}/);
    // 단추는 남는다 — 목록에서 바로 틀고 싶은 사람을 화면 한 번 더 거치게 하지 않는다.
    expect(list).toMatch(/<WebAudio/);
  });

  it("옛 기사 줄은 있을 때만 그린다", () => {
    // 없는 주차에 '0년 전'이나 빈 줄을 그리면 아카이브가 비어 보인다.
    //   2026-11-09: 기사 목록이 읽기 패널을 갖느라 episode-articles.tsx 로 옮겨 갔다.
    //   지키는 것은 그대로다 — 옛 기사가 있을 때만 그 줄을 그린다.
    expect(list()).toMatch(/\{throwback &&/);
  });

  it("옛 기사는 읽기 패널에 섞이지 않는다", () => {
    // '이 회의 기사 N/M' 의 M 에 끼면, 이 회차가 다루지 않은 것을 다룬 것처럼 센다.
    const l = list();
    const panel = l.slice(l.indexOf("<ArticlePanel"));
    expect(panel).not.toMatch(/throwback/);
    expect(l).toMatch(/articles=\{articles\}/);
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
  // 2026-11-09: 같은 판정을 기사 화면에도 써야 해서 use-broken-image.ts 한 군데로 옮겼다.
  //   MosaicPhoto 가 '직접' 확인하는지가 아니라 **그 판정을 거치는지**를 본다.
  //   판정 내용 자체는 src/components/__tests__/broken-image.test.ts 가 지킨다.
  it("MosaicPhoto 가 공용 판정을 거친다", () => {
    const m = readFileSync(join(process.cwd(), "src/components/reports/mosaic-photo.tsx"), "utf8");
    expect(m).toMatch(/useBrokenImage/);
  });

  it("공용 판정은 마운트 때 complete·naturalWidth 를 직접 묻는다", () => {
    const h = readFileSync(join(process.cwd(), "src/components/use-broken-image.ts"), "utf8");
    expect(h).toMatch(/useEffect\(/);
    expect(h).toMatch(/complete[\s\S]{0,40}naturalWidth === 0/);
  });
});

// 2026-11-10 사용자: "현재 최근 것은 보이는 상태에서 하단에 과거 것을 보이면 되게 해".
//   그전엔 '다시 듣기'의 줄을 누르면 /reports/<주차> 로 떠나 **이번 주 회차가 화면에서 사라졌다**.
//   지난 회차 한 편을 들춰 보는 일이 이번 주를 닫는 일이 되는 게 이상했다.
describe("지난 회차는 이번 주를 지우지 않고 아래에 펼친다", () => {
  const strip = (p: string) =>
    readFileSync(join(process.cwd(), p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const rows = () => strip("src/components/reports/podcast-episodes.tsx");
  const inline = () => strip("src/components/reports/episode-inline.tsx");
  const head = () => strip("src/components/reports/episode-head.tsx");

  it("/reports 는 펼치기를 켠다", () => {
    expect(strip("src/app/reports/page.tsx")).toMatch(/<PodcastEpisodes[^>]*\binline\b/);
  });

  it("지난 회차 화면도 켜다 — 맨 위엔 늘 최신호가 선다", () => {
    // 2026-11-10 사용자: "주간리포트에 최신호가 오픈되어 있어야 하고,
    //   과거 팟캐스트는 하나만 열리도록 하자". 그전엔 이 화면에 그 회차만 서 있어
    //   **최신호가 통째로 사라졌다**.
    const page = strip("src/app/reports/[weekId]/page.tsx");
    expect(page).toMatch(/<PodcastEpisodes[\s\S]*?\binline\b/);
    expect(page, "맨 위는 최신호다").toMatch(/latest \? <EpisodeHead episode=\{latest\}/);
    expect(page, "최신호를 못 구해도 이 회차가 그 자리에 선다(h1 은 하나 있어야 한다)")
      .toMatch(/: <EpisodeHead episode=\{episode\} latest=\{isLatest\}/);
  });

  it("이 주소가 곰 최신호면 같은 회차를 두 번 그리지 않는다", () => {
    const page = strip("src/app/reports/[weekId]/page.tsx");
    expect(page).toMatch(/const isLatest = !!report && report\.weekId === weekId;/);
    expect(page).toMatch(/initialWeekId=\{latest \? weekId : undefined\}/);
  });

  it("보려던 회차는 **서버가** 그려 내려보낸다 — 검색엔진이 읽는 건 그쪽이다", () => {
    // 브라우저에서 받아 오게 두면 서버 HTML 에는 '회차를 불러오는 중입니다…' 만 남는다 —
    //   회차마다 제 주소를 준 이유(검색·공유)가 통째로 무너진다.
    expect(strip("src/app/reports/[weekId]/page.tsx"))
      .toMatch(/initialEpisode=\{latest \? episode : undefined\}/);
    expect(rows()).toMatch(/initial=\{open === initialWeekId \? initialEpisode : undefined\}/);
    expect(inline(), "넘거받은 회차를 첫 그림에 바로 쓴다")
      .toMatch(/useState<Load>\(initial \? \{ st: "ok", episode: initial \}/);
  });

  it("목록이 아직 안 왔어도 펼쳐 둔 회차는 그린다", () => {
    // 목록은 브라우저가 받아 오지만 펼쳐 둔 회차는 서버가 이미 그려 둔다.
    //   같이 숨기면 주소로 들어온 사람이 빈 화면을 본다.
    const l = rows();
    expect(l).not.toMatch(/if \(!eps \|\| list\.length === 0\) return null;/);
    expect(l).toMatch(/const showList = !!eps && list\.length > 0;/);
  });

  it("주소로 들어와 처음부터 펼쳐진 회차는 데려가지 않는다", () => {
    // 데려가면 맨 위에 열려 있는 최신호를 지나쳐 내려가 버린다 —
    //   최신호를 보이게 하려고 한 일이 헛일이 된다.
    const i = inline();
    const scroll = i.indexOf("scrollIntoView");
    const skip = i.indexOf("if (focusKey === 0) return;");
    expect(skip, "focusKey 0 가드가 없다").toBeGreaterThan(-1);
    expect(skip).toBeLessThan(scroll);
  });

  it("링크는 살려 두고 왼쪽 클릭만 가로챈다", () => {
    // href 를 지우면 검색엔진이 길을 잃고 ⌘클릭으로 새 탭에 여는 사람도 막힌다.
    expect(rows()).toMatch(/href=\{`\/reports\/\$\{e\.weekId\}`\}/);
    expect(rows()).toMatch(/if \(!inline \|\| wantsNewTab\(ev\)\) return;/);
  });

  it("펼친 회차는 '다시 듣기' 목록 밖·아래에 선다", () => {
    // 목록 안에 끼우면 '다시 듣기'라는 제목 밑에 회차 한 편이 통째로 들어가 목록의 결이 끊긴다.
    const l = rows();
    expect(l.indexOf("<EpisodeInline")).toBeGreaterThan(l.indexOf("</section>"));
  });

  it("머리를 베끼지 않는다 — 같은 EpisodeHead 를 쓴다", () => {
    expect(inline()).toMatch(/<EpisodeHead[^>]*embedded/);
    expect(inline()).not.toMatch(/<h1[\s>]/);
  });

  it("끼워 넣은 회차는 h2 로 내려간다 — 한 화면에 h1 이 둘이 되지 않게", () => {
    const h = head();
    expect(h.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(h).toMatch(/embedded \?[\s\S]{0,160}<h2 id=\{titleId\}/);
  });

  it("id 를 주차로 갈라 둔다 — 같은 id 가 둘이면 제목을 잘못 짚는다", () => {
    const h = head();
    expect(h).not.toMatch(/id="episode-title"/);
    expect(h).not.toMatch(/id="episode-articles"/);
    expect(h).toMatch(/const uid = embedded \? `-\$\{episode\.weekId\}`/);
  });

  it("ESC 를 듣지 않는다 — 읽기 패널의 ESC 까지 삼킨다", () => {
    // 이 안의 기사 목록은 article-panel 을 연다. 둘 다 ESC 를 들으면
    //   패널을 닫으려 누른 ESC 가 회차까지 접어 버린다.
    expect(inline()).not.toMatch(/Escape/);
  });

  it("못 불러오면 그렇게 적는다 — 빈 칸을 펼쳐 놓지 않는다", () => {
    expect(inline()).toMatch(/불러오지 못했습니다/);
  });

  it("펼친 지난 회차에 데이터 분석을 붙이지 않는다", () => {
    // 분석은 최신 주차 기준이라 지난 주차에 붙으면 그 주의 분석인 척하게 된다.
    expect(inline()).not.toMatch(/ReportReader|RequireRole/);
  });
});
