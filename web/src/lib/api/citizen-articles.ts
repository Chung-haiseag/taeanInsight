// 시민기자 기사 CRUD 클라이언트 — backend/src/citizen/articles_router.ts 매핑(uid 소유).
import { apiFetch } from "./client";
import type { AiLabel } from "./copilot";

export interface CitizenArticle {
  id: string;
  title: string;
  body: string;
  aiLabel: AiLabel;
  sources: { title: string; url?: string }[];
  coverImageUrl: string | null;
  status: "draft" | "submitted" | "reviewing" | "published" | "rejected";
  reviewId: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
}

export interface ArticleInput {
  title?: string;
  body?: string;
  aiLabel?: AiLabel;
  sources?: { title: string; url?: string }[];
}

export const listMyArticles = () => apiFetch<{ items: CitizenArticle[] }>("/api/citizen/articles").then((d) => d.items);
export const getMyArticle = (id: string) => apiFetch<{ article: CitizenArticle }>(`/api/citizen/articles/${id}`).then((d) => d.article);
export const createArticle = (input: ArticleInput) => apiFetch<{ ok: boolean; id: string }>("/api/citizen/articles", { method: "POST", body: JSON.stringify(input) });
export const updateArticle = (id: string, input: ArticleInput) => apiFetch(`/api/citizen/articles/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteArticle = (id: string) => apiFetch(`/api/citizen/articles/${id}`, { method: "DELETE" });
export const submitArticle = (id: string) =>
  apiFetch<{ ok: boolean; queued: boolean; reviewId: string; aiLabelText: string; publishAllowed: boolean; reasons: string[]; message: string }>(
    `/api/citizen/articles/${id}/submit`, { method: "POST", body: "{}" },
  );

export const STATUS_LABEL: Record<CitizenArticle["status"], string> = {
  draft: "초안", submitted: "제출됨", reviewing: "검수 중", published: "발행됨", rejected: "반려",
};
