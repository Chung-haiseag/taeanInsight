// AI Query Agent API 클라이언트 — backend/src/query/router.ts 매핑

import { apiFetch } from "./client";

export type QueryDomain = "tourism" | "environment" | "realestate" | "general";

export interface QuerySource {
  title: string;
  url?: string;
  publishedAt?: string;
  publisher?: string;
}

export interface QueryResult {
  answer: string;
  intent: string;
  confidence: number | null;
  fromCache: boolean;
  llmCalls: number;
  sources: QuerySource[];
  model: string;
}

export async function askQuery(input: {
  query: string;
  domain?: QueryDomain;
  location?: string;
  userTier?: "anon" | "b2c" | "b2b" | "b2g";
}): Promise<QueryResult> {
  return apiFetch<QueryResult>("/api/query", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
