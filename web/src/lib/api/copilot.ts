// 시민 코파일럿 API 클라이언트 — backend/src/copilot/router.ts 매핑

import { apiFetch, buildApiHeaders, API_BASE_URL } from "./client";

export type AiLabel = "human" | "ai_assisted" | "ai_generated";

export interface CheckResult {
  chars: number;
  pii: {
    count: number;
    kinds: string[];
    maskedPreview: string | null;
    samples?: { kind: string; matched: string }[];
  };
  sensitive: {
    topics: { topic: string; matched: string[] }[];
    requiresHitl: boolean;
    blockAiOnly: boolean;
  };
  warnings: string[];
}

export interface SubmitResult {
  ok: boolean;
  queued: boolean;
  reviewId: string;
  aiLabel: AiLabel;
  aiLabelText: string;
  publishAllowed: boolean;
  reasons: string[];
  message: string;
}

export async function copilotCheck(title: string, text: string): Promise<CheckResult> {
  return apiFetch("/api/copilot/check", { method: "POST", body: JSON.stringify({ title, text }) });
}

export type AssistMode = "polish" | "summarize" | "title" | "factcheck";

export async function copilotAssist(mode: AssistMode, text: string): Promise<{ result: string; model: string }> {
  return apiFetch("/api/copilot/assist", { method: "POST", body: JSON.stringify({ mode, text }) });
}

// 관련 과거기사 — 작성 중 주제로 태안신문 아카이브 검색(무LLM FTS5). 맥락·중복·후속취재용.
export interface RelatedArticle {
  idxno: number;
  title: string;
  publishedAt: string;
  excerpt: string;
  category: string;
}
export async function copilotRelated(title: string, text: string): Promise<{ items: RelatedArticle[] }> {
  return apiFetch("/api/copilot/related", { method: "POST", body: JSON.stringify({ title, text }) });
}

// 실시간 데이터 블록(날씨·물때·해넘이) — 본문에 끼워넣을 출처 표기 텍스트.
export interface ContextBlock {
  id: string;
  label: string;
  markdown: string;
}
export async function copilotContextData(): Promise<{ available: boolean; blocks: ContextBlock[] }> {
  return apiFetch("/api/copilot/context-data");
}

// 키워드 → 기사 초안(시민기자가 수정). 사실은 [확인 필요] 자리표시로 비워둠.
export async function copilotDraft(keywords: string): Promise<{ ok: boolean; title: string; body: string; model: string }> {
  return apiFetch("/api/copilot/draft", { method: "POST", body: JSON.stringify({ keywords }) });
}

// 이미지 업로드(R2) → 서빙 URL. apiFetch는 JSON 전용이라 바이너리는 직접 fetch한다.
//   ⚠ 단, 헤더는 buildApiHeaders를 반드시 재사용할 것 — copilot 라우터는 전 경로에 세션 인증이
//     걸려 있어(`use("*")`), 손으로 헤더를 만들면 Authorization이 빠져 **항상 401**이 난다.
//     실제로 그 상태로 배포돼 시민기자 사진 업로드가 동작하지 않았다(2026-08-17 발견).
export async function copilotUploadImage(file: File): Promise<{ url: string; key: string }> {
  const headers = await buildApiHeaders();
  headers.set("content-type", file.type || "image/jpeg"); // JSON 기본값을 바이너리 타입으로 교체
  const res = await fetch(`${API_BASE_URL}/api/copilot/upload`, {
    method: "POST",
    headers,
    body: file,
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(e.message ?? `업로드 실패(${res.status})`);
  }
  return res.json();
}

export async function copilotSubmit(input: {
  title: string;
  body: string;
  aiLabel: AiLabel;
  sources?: { title: string; url?: string }[];
  reporterId?: string;
}): Promise<SubmitResult> {
  return apiFetch("/api/copilot/submit", { method: "POST", body: JSON.stringify(input) });
}

export const SENSITIVE_LABELS: Record<string, string> = {
  election: "선거",
  crime: "범죄",
  medical: "의료",
  religion: "종교",
  political_figure: "정치인",
  realestate_speculation: "부동산 투기",
  minority_issues: "소수자 이슈",
};

export const PII_LABELS: Record<string, string> = {
  rrn: "주민번호",
  phone: "전화",
  email: "이메일",
  card: "카드",
  address: "주소",
  passport: "여권",
};
