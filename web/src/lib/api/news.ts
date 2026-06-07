// 태안뉴스 API 클라이언트 — backend/src/news/router.ts 매핑

import { apiFetch } from "./client";

export type NewsCategory =
  | "tourism"
  | "environment"
  | "realestate"
  | "policy"
  | "industry"
  | "culture"
  | "society";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  author?: string;
  publishedAt: string;
  category: NewsCategory;
}

export interface NewsResponse {
  items: NewsItem[];
  total: number;
  counts: Record<string, number>;
  labels: Record<string, string>;
  source: string;
}

export async function getNews(category?: string, limit?: number): Promise<NewsResponse> {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (limit) params.set("limit", String(limit));
  const q = params.toString();
  return apiFetch<NewsResponse>(`/api/news${q ? `?${q}` : ""}`);
}

export interface NewsArticle extends NewsItem {
  categoryLabel: string;
  bodySource: "rss_excerpt" | "archive_fulltext";
}

export async function getNewsItem(id: string): Promise<NewsArticle> {
  return apiFetch<NewsArticle>(`/api/news/${id}`);
}
