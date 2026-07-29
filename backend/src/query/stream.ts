// Workers AI SSE 스트림 파서 — 청크 경계에서 잘린 줄을 rest로 넘겨 안전하게 누적한다. 순수.
// 형식: `data: {"response":"토큰"}\n\n` 반복, 종료는 `data: [DONE]`.

export interface SseDrain {
  tokens: string[]; // 이번 청크에서 완성된 response 토큰들(순서 보존)
  done: boolean;    // [DONE] 도달 여부
  rest: string;     // 아직 개행으로 끝나지 않은 미완성 잔여(다음 청크 앞에 붙일 것)
}

export function drainSse(buffer: string): SseDrain {
  const norm = buffer.replace(/\r\n/g, "\n");
  const lines = norm.split("\n");
  const rest = lines.pop() ?? ""; // 마지막 조각은 개행이 없으므로 미완성 → 잔여로 보존
  const tokens: string[] = [];
  let done = false;
  for (const line of lines) {
    const m = line.match(/^data:\s?(.*)$/);
    if (!m) continue; // 빈 줄·주석(:)·기타는 무시
    const payload = m[1];
    if (payload === "[DONE]") { done = true; continue; }
    try {
      const j = JSON.parse(payload) as { response?: unknown };
      if (typeof j.response === "string") tokens.push(j.response);
    } catch { /* 완성된 줄만 처리하므로 도달 드묾 — 안전차원 무시 */ }
  }
  return { tokens, done, rest };
}
