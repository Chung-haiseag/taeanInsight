// 민감주제 규칙 관리 API 클라이언트 — backend/src/governance/rules_router.ts 매핑

import { apiFetch } from "./client";
import { SENSITIVE_TOPIC_LABELS } from "./review";

export interface ManagedRule {
  topic: string;
  keywords: string[];
  requiresHitl: boolean;
  blockAiOnly: boolean;
  description: string;
  enabled: boolean;
}

export interface RuleUpdate {
  enabled?: boolean;
  requiresHitl?: boolean;
  blockAiOnly?: boolean;
  keywords?: string[];
}

export interface ClassifyTestResult {
  requiresHitl: boolean;
  blockAiOnly: boolean;
  matches: { topic: string; matchedKeywords: string[] }[];
}

export async function getRules(): Promise<{ rules: ManagedRule[] }> {
  return apiFetch<{ rules: ManagedRule[] }>("/api/admin/rules");
}

export async function updateRule(topic: string, patch: RuleUpdate): Promise<{ ok: boolean; rule: ManagedRule }> {
  return apiFetch(`/api/admin/rules/${topic}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function classifyTest(text: string): Promise<ClassifyTestResult> {
  return apiFetch("/api/admin/rules/classify-test", { method: "POST", body: JSON.stringify({ text }) });
}

export { SENSITIVE_TOPIC_LABELS };
