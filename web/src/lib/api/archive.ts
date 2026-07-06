// 아카이브(24년) API 클라이언트 — backend/src/archive/router.ts 매핑

import { apiFetch } from "./client";

export interface ArchiveHit {
  idxno: number;
  title: string;
  published_at: string;
  year: number;
  section: string;
  category: string;
  author?: string;
  excerpt?: string;
  lead_image?: string | null;
  members_only?: number;
}

export interface ArchiveSearchResult {
  items: ArchiveHit[];
  page: number;
  pageSize: number;
  mode?: string;
  total?: number;        // 현재 검색 조건의 전체 결과 건수
  totalPages?: number;   // 전체 페이지 수
  hasMore?: boolean;
  note?: string;
}

export interface ArchiveArticle extends ArchiveHit {
  body?: string;
  images?: string[];
  url?: string;
  faithfulness?: number | null; // 전자북 OCR 충실도(낮으면 독자에 원본 대조 안내)
}

export async function searchArchive(params: {
  q?: string;
  category?: string;
  year?: string;
  page?: number;
}): Promise<ArchiveSearchResult> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.category) sp.set("category", params.category);
  if (params.year) sp.set("year", params.year);
  if (params.page) sp.set("page", String(params.page));
  const qs = sp.toString();
  return apiFetch<ArchiveSearchResult>(`/api/archive/search${qs ? `?${qs}` : ""}`);
}

export interface ArchiveStats { total: number; minYear: number | null; maxYear: number | null }
export async function getArchiveStats(): Promise<ArchiveStats> {
  try {
    return await apiFetch<ArchiveStats>("/api/archive/stats");
  } catch {
    return { total: 0, minYear: null, maxYear: null };
  }
}

export async function getArchiveArticle(idxno: number): Promise<ArchiveArticle> {
  return apiFetch<ArchiveArticle>(`/api/archive/${idxno}`);
}

export interface RelatedResult {
  items: ArchiveHit[];
  total: number;
  page: number;
  pageSize: number;
  mode: string;
  keywords: string[];
}

export async function getRelatedArchive(idxno: number, page = 1): Promise<RelatedResult> {
  return apiFetch<RelatedResult>(`/api/archive/related/${idxno}?page=${page}`);
}

export const ARCHIVE_CATEGORY_LABELS: Record<string, string> = {
  tourism: "관광",
  environment: "환경",
  realestate: "부동산",
  policy: "정책·행정",
  industry: "수산·산업",
  culture: "문화·교육",
  society: "지역사회",
};
