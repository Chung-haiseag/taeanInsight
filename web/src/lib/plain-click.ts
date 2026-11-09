import type { MouseEvent } from "react";

// 링크를 **가로채도 되는 클릭인가** — 한 군데에서만 판정한다.
//
//   왜 한 군데인가: 화면 안에서 바로 여는 자리가 늘어나면(기사 읽기 패널, 지난 회차 펼치기)
//   같은 판정을 복사하게 된다. 한쪽만 고쳐지면 어떤 목록은 ⌘클릭이 먹고 어떤 목록은 안 먹는
//   — 독자가 설명할 수 없는 차이가 생긴다(use-broken-image.ts 와 같은 이유로 모았다).
//
//   가로채지 않는 클릭: ⌘/Ctrl(새 탭) · Shift(새 창) · Alt(내려받기) · 가운데 단추.
//   그래서 href 는 늘 살려 둔다 — 검색엔진도, 새 탭으로 여는 사람도 예전 길을 그대로 쓴다.
export const wantsNewTab = (e: MouseEvent) =>
  e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
