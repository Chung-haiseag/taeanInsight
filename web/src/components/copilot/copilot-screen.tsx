"use client";

// 서버 컴포넌트 화면이 코파일럿에게 자기 값을 건네는 다리.
//   서버에서 만든 문자열을 받아 클라이언트 쪽 등록기에 넘긴다. 그리는 것은 없다.

import { useCopilotScreen } from "@/lib/copilot-screen";

export function CopilotScreen({ text }: { text: string | null }) {
  useCopilotScreen(text);
  return null;
}
