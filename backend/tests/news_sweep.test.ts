import { describe, it, expect } from "vitest";

import { isNotFoundPage, parseArticleMeta, planSweep, nextBackCursor } from "../src/news/sweep";

// 2026-09-14 발견: 6-12 이후 태안신문 기사의 절반이 아카이브에 없었다(770칸 중 285건, 표본 40칸 중 26칸이 실제 기사).
// 원인 — RSS는 고장(최신 9-04·50건이 3~9월에 흩어짐), 기사목록은 첫 25건만(2페이지부터 비로그인 불가).
// 신문은 금요일 16시에 60~70건을 한꺼번에 올리므로 목록 25건 밖은 수집기가 볼 기회가 없다.
// 해법 — 기사번호(idxno)가 순차라는 점을 써서 마지막 번호 다음부터 차례로 두드린다.

const NOT_FOUND = `<script>alert('존재하지 않는 링크 입니다.\\n링크를 확인해 주세요.'); history.back(); </script>`;

function page(opts: { title?: string; section?: string; section1?: string; author?: string; time?: string; gated?: boolean; body?: string }) {
  const meta = [
    opts.title !== undefined ? `<meta property="og:title" content="${opts.title}" />` : "",
    `<meta property="og:description" content="본지와 태안문화원이 향토사료를 보존하기 위해…" />`,
    opts.section ? `<meta property="article:section" content="${opts.section}" />` : "",
    opts.section1 ? `<meta property="article:section1" content="${opts.section1}" />` : "",
    opts.author ? `<meta name="author" content="${opts.author}" />` : "",
    opts.time ? `<meta property="article:published_time" content="${opts.time}" />` : "",
  ].join("\n");
  const body = opts.gated
    ? `<div class="member-only">회원전용기사 로그인 또는 회원가입을 해주세요. (회원만 열람가능)</div>`
    : `<p>${opts.body ?? "본문 문단."}</p>`;
  return `<html><head>${meta}</head><body><div id="article-view-content-div">${body}</div><div>저작권자 © 주간태안신문</div></body></html>`;
}

describe("isNotFoundPage — 없는 번호는 73바이트 alert 페이지", () => {
  it("alert('존재하지 않는 링크') 페이지를 없음으로 읽는다", () => {
    expect(isNotFoundPage(NOT_FOUND)).toBe(true);
  });
  it("정상 기사·회원전용 게이트 페이지는 있음", () => {
    expect(isNotFoundPage(page({ title: "t" }))).toBe(false);
    expect(isNotFoundPage(page({ title: "t", gated: true }))).toBe(false);
  });
  it("빈 응답·og:title 없는 응답도 없음으로 읽는다(있다고 넣는 것보다 낫다)", () => {
    expect(isNotFoundPage("")).toBe(true);
    expect(isNotFoundPage("<html><body>점검중</body></html>")).toBe(true);
  });
});

describe("parseArticleMeta — 기사 페이지 메타에서 제목·시각·섹션·기자", () => {
  const html = page({
    title: "&ldquo;태안에도 언젠가 해녀박물관 생기지 않을까?&rdquo;&hellip; 소중히 간직해온 해녀 유물 기증",
    section: "뉴스", section1: "문화", author: "김동이 기자", time: "2026-06-19T16:00:00+09:00", gated: true,
  });
  it("제목은 엔티티를 풀고, 섹션은 백필 관례(대>소)로, 시각은 ISO+09:00 그대로", () => {
    const m = parseArticleMeta(html);
    expect(m).toEqual({
      title: "\"태안에도 언젠가 해녀박물관 생기지 않을까?\"… 소중히 간직해온 해녀 유물 기증",
      publishedAt: "2026-06-19T16:00:00+09:00",
      section: "뉴스>문화",
      author: "김동이 기자",
      excerpt: "본지와 태안문화원이 향토사료를 보존하기 위해…",
      gated: true,
    });
  });
  it("소섹션이 없으면 대섹션만, 기자 없으면 null, 공개 기사는 gated=false", () => {
    const m = parseArticleMeta(page({ title: "사설", section: "오피니언", time: "2026-09-11T16:00:00+09:00" }));
    expect(m?.section).toBe("오피니언");
    expect(m?.author).toBeNull();
    expect(m?.gated).toBe(false);
  });
  it("섹션의 &amp;는 풀되 숫자 엔티티는 백필본과 같게 남긴다('농&#12539;어업' 2,273건과 한 갈래)", () => {
    const m = parseArticleMeta(page({ title: "t", section: "뉴스", section1: "농&amp;#12539;어업", time: "2026-09-11T16:00:00+09:00" }));
    expect(m?.section).toBe("뉴스>농&#12539;어업");
  });

  it("제목이나 발행시각이 없으면 null — 반쪽 행을 넣지 않는다", () => {
    expect(parseArticleMeta(page({ section: "뉴스", time: "2026-09-11T16:00:00+09:00" }))).toBeNull();
    expect(parseArticleMeta(page({ title: "t" }))).toBeNull();
  });
});

describe("planSweep — 어느 번호를 두드릴지", () => {
  const existing = new Set([68301, 68302, 68305, 68310, 68400, 68401, 69068, 69070]);
  it("앞(frontier+1..+ahead)은 전부, 뒤(frontier-behind..frontier)는 빈 칸만 내림차순", () => {
    const p = planSweep({ existing, frontier: 69070, floor: 68301, back: 68399, ahead: 3, behind: 4 });
    expect(p.forward).toEqual([69071, 69072, 69073]);
    expect(p.behind).toEqual([69069, 69067, 69066]);
  });
  it("백필은 back 커서에서 아래로 빈 칸만, 예산만큼, 뒤 창과 겹치지 않게", () => {
    const p = planSweep({ existing, frontier: 69070, floor: 68301, back: 68402, ahead: 0, behind: 2, backBudget: 3 });
    expect(p.backfill).toEqual([68402, 68399, 68398]);
  });
  it("back 커서가 바닥 아래거나 done이면 백필 없음", () => {
    expect(planSweep({ existing, frontier: 69070, floor: 68301, back: 68300, ahead: 1, behind: 1 }).backfill).toEqual([]);
    expect(planSweep({ existing, frontier: 69070, floor: 68301, back: 68402, backDone: true, ahead: 1, behind: 1 }).backfill).toEqual([]);
  });
  it("back 커서가 뒤 창 안에 있으면 창 아래부터 시작한다(같은 칸을 두 번 두드리지 않는다)", () => {
    const p = planSweep({ existing, frontier: 69070, floor: 68301, back: 69069, ahead: 0, behind: 3, backBudget: 2 });
    expect(p.behind).toEqual([69069, 69067]);
    expect(p.backfill).toEqual([69066, 69065]);
  });
  it("바닥 아래 번호는 절대 없다", () => {
    const p = planSweep({ existing: new Set([68302]), frontier: 68302, floor: 68301, back: 68302, ahead: 0, behind: 10, backBudget: 10 });
    expect(p.behind).toEqual([68301]);
    expect(p.backfill).toEqual([]);
  });
});

describe("nextBackCursor — 백필 커서는 이번에 두드린 가장 작은 번호 아래로", () => {
  it("두드린 게 있으면 min-1, 바닥에 닿으면 done", () => {
    expect(nextBackCursor([68402, 68399, 68398], 68301)).toEqual({ back: 68397, done: false });
    expect(nextBackCursor([68302, 68301], 68301)).toEqual({ back: 68300, done: true });
  });
  it("두드릴 게 없었으면(빈 칸 소진) done", () => {
    expect(nextBackCursor([], 68301)).toEqual({ back: 68300, done: true });
  });
});
