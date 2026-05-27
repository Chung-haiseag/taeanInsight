// LangGraph Lite — 자체 경량 그래프 시스템
// PRD v1.8 §6 REQ-AI-001 (LangGraph Lite Router + 2 Expert Agents)
// 의존성 0, Edge runtime 친화. 향후 @langchain/langgraph로 교체 원하면 어댑터 추가.

import type { LlmIntent, LlmMessage } from "../llm/types";

export interface SourceCitation {
  title: string;
  url?: string;
  publishedAt?: string;
  publisher?: string;
}

// 그래프 실행 컨텍스트 — 노드 간 공유 상태
export interface AgentContext {
  // 입력
  query: string;
  userTier?: string;
  domain?: string;            // 사용자 컨텍스트 (관심 분야)
  location?: string;          // 사용자 컨텍스트 (관심 지역)

  // 라우터가 채움
  intent?: LlmIntent;
  confidence?: number;
  cacheKey?: string;

  // 응답
  answer?: string;
  sources?: SourceCitation[];
  fromCache?: boolean;
  llmCalls?: number;          // 이 질의 처리에 든 LLM 호출 횟수 (목표: ≤ 2)
  costKrwTotal?: number;
  metadata?: Record<string, unknown>;
}

// 노드 처리 결과
export interface NodeResult {
  // 다음에 실행할 노드 이름. null이면 종료.
  next: string | null;
  // 컨텍스트에 병합할 부분 업데이트
  patch?: Partial<AgentContext>;
}

// 노드 = 컨텍스트를 받아 NodeResult 반환
export type AgentNode = (ctx: AgentContext) => Promise<NodeResult>;

export interface GraphDefinition {
  nodes: Record<string, AgentNode>;
  entry: string;
}

// 메시지 빌더 헬퍼
export function buildMessages(systemPrompt: string, userQuery: string): LlmMessage[] {
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userQuery },
  ];
}
