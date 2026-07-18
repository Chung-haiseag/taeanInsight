// AI Query Agent API 클라이언트 — backend/src/query/router.ts 매핑

import { apiFetch } from "./client";

export type QueryDomain = "tourism" | "environment" | "realestate" | "general";

export interface QuerySource {
  title: string;
  url: string | null;
  kind?: string;
  publishedAt?: string;
}

export interface QueryEvidence { n: number; source: string; text: string }
export interface QueryResult {
  answer: string;
  intent: string;
  confidence: number | null;
  fromCache: boolean;
  llmCalls: number;
  sources: QuerySource[];
  model: string;
  evidence?: QueryEvidence[];
}

export async function askQuery(input: {
  query: string;
  domain?: QueryDomain;
  location?: string;
  userTier?: "anon" | "b2c" | "b2b" | "b2g";
}): Promise<QueryResult> {
  // evidence=1: AI가 받은 실시간 근거 원문을 함께 받아 "근거 보기"로 노출(RAG 투명성)
  return apiFetch<QueryResult>("/api/query?evidence=1", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
