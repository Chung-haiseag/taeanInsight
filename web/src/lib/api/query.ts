// AI Query Agent API 클라이언트 — backend/src/query/router.ts 매핑

import { apiFetch, API_BASE_URL, buildApiHeaders } from "./client";

export type QueryDomain = "tourism" | "environment" | "realestate" | "general";

export interface QuerySource {
  title: string;
  url: string | null;
  kind?: string;
  publishedAt?: string;
}

export interface QueryEvidence { n: number; source: string; text: string }
export interface QueryPersonBrief { id: string; name: string; text: string }
export interface QueryResult {
  answer: string;
  intent: string;
  confidence: number | null;
  fromCache: boolean;
  llmCalls: number;
  sources: QuerySource[];
  model: string;
  evidence?: QueryEvidence[];
  personBrief?: QueryPersonBrief;
}

export interface AskQueryInput {
  query: string;
  domain?: QueryDomain;
  location?: string;
  userTier?: "anon" | "b2c" | "b2b" | "b2g";
}

export async function askQuery(input: AskQueryInput): Promise<QueryResult> {
  // evidence=1: AI가 받은 실시간 근거 원문을 함께 받아 "근거 보기"로 노출(RAG 투명성)
  return apiFetch<QueryResult>("/api/query?evidence=1", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface StreamHandlers {
  onToken: (chunk: string) => void;             // 토큰 도착(체감 지연↓)
  onDone: (result: QueryResult) => void;        // 완료 — 정리본·출처·근거
  onError: (message: string, status?: number) => void;
}

// 스트리밍 질의 — 토큰을 흘려받아 실시간 표시하고, done에서 최종 결과로 교체.
// SSE(event: token|done|error)를 fetch ReadableStream으로 파싱. 실패 시 onError.
export async function askQueryStream(input: AskQueryInput, h: StreamHandlers): Promise<void> {
  let res: Response;
  try {
    const headers = await buildApiHeaders();
    res = await fetch(`${API_BASE_URL}/api/query?stream=1&evidence=1`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
  } catch {
    h.onError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }
  if (!res.ok || !res.body) {
    h.onError(`요청 실패 (${res.status})`, res.status);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const handleEvent = (event: string, dataLines: string[]) => {
    const data = dataLines.join("\n");
    if (!data) return;
    if (event === "token") {
      try { h.onToken(JSON.parse(data) as string); } catch { /* 무시 */ }
    } else if (event === "done") {
      try { h.onDone(JSON.parse(data) as QueryResult); } catch { h.onError("응답 파싱 실패"); }
    } else if (event === "error") {
      let msg = "답변 생성에 실패했습니다.";
      try { msg = JSON.parse(data) as string; } catch { /* 무시 */ }
      h.onError(msg);
    }
  };

  // SSE 블록(빈 줄로 구분)을 누적 파싱. 블록 안 event:/data: 라인을 모은다.
  const flushBlocks = () => {
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const raw of block.split("\n")) {
        const line = raw.replace(/\r$/, "");
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
      }
      if (dataLines.length) handleEvent(event, dataLines);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    flushBlocks();
  }
  buf += decoder.decode();
  flushBlocks();
}
