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
  leadImage?: string | null;  // 아카이브(D1)에서 조인된 대표사진
}

export interface NewsResponse {
  items: NewsItem[];
  total: number;
  counts: Record<string, number>;
  labels: Record<string, string>;
  source: string;
  personalized?: boolean;
  interests?: string[];
}

export async function getNews(category?: string, limit?: number): Promise<NewsResponse> {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (limit) params.set("limit", String(limit));
  const q = params.toString();
  return apiFetch<NewsResponse>(`/api/news${q ? `?${q}` : ""}`);
}

// 태안군TV(유튜브) 영상 — 서버 저장 없이 백엔드가 채널 RSS를 패스스루
export interface TvVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
  description: string;
}

export interface TvNewsResponse {
  items: TvVideo[];
  source: string;
  channelUrl: string;
}

export async function getTvNews(): Promise<TvNewsResponse> {
  return apiFetch<TvNewsResponse>("/api/news/tv");
}

export interface NewsArticle extends NewsItem {
  categoryLabel: string;
  bodySource: "rss_excerpt" | "archive_fulltext";
}

export async function getNewsItem(id: string): Promise<NewsArticle> {
  return apiFetch<NewsArticle>(`/api/news/${id}`);
}
