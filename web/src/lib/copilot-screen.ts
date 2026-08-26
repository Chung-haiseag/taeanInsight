"use client";

// 코파일럿에게 '지금 화면에 보이는 값'을 건네는 통로.
//
//   왜 필요한가: 표·목록은 기사 색인에 없다. 실측(2026-08-26) 옛날 물가표를 띄워 두고
//     "1997년 전세는 얼마였어?"를 물었더니 **바로 옆에 답(1,400만원)이 있는데도**
//     "자료를 찾지 못했습니다"라고 답했다. 화면이 자기 값을 직접 건네야 한다.
//
//   설계: 리액트 컨텍스트 대신 모듈 변수 하나. 코파일럿은 레이아웃에 있고 화면은 그 아래라
//     컨텍스트로 이으려면 구조를 바꿔야 하는데, 값은 보낼 때 한 번만 읽으면 되므로
//     다시 그릴 이유가 없다.

import { useEffect } from "react";

let current: string | null = null;

/** 보낼 때 읽는다. 너무 길면 근거 자리를 잡아먹으므로 서버에서도 한 번 더 자른다. */
export function getCopilotScreen(): string | null {
  return current;
}

/**
 * 이 화면이 무엇을 보여주고 있는지 사실만 짧게 적어 둔다.
 *   ⚠ 화면을 떠나면 지운다 — 남아 있으면 다음 화면에서 엉뚱한 값을 근거라고 내민다.
 */
export function useCopilotScreen(text: string | null | undefined): void {
  useEffect(() => {
    current = text ? String(text).slice(0, 2000) : null;
    return () => { current = null; };
  }, [text]);
}
