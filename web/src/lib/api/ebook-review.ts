// 전자북 디지털화 검수 API 클라이언트 — backend/src/archive/ebook_review.ts 매핑

import { apiFetch } from "./client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.insight.taeannews.co.kr";
/** 백엔드가 주는 상대경로(/api/...)를 절대 URL로 */
export function absUrl(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith("/") ? `${API_BASE}${path}` : path;
}

export interface EbookIssue {
  date: string;          // "1990-05-14"
  total: number;
  approved: number;
  flagged: number;
  unverified: number;
  avg_faith: number | null;
}

export type VerifyStatus = "approved" | "flagged" | null;

export interface EbookArticle {
  idxno: number;
  title: string;
  section: string | null;
  category: string | null;
  excerpt: string | null;
  body: string | null;
  lead_image: string | null;
  faithfulness: number | null;
  verify_status: VerifyStatus;
  verify_note: string | null;
  verified_at: string | null;
  page_image: string | null;   // 원본 지면 이미지 경로(/api/archive/photo/...)
}

export async function getEbookIssues(): Promise<{ issues: EbookIssue[] }> {
  return apiFetch("/api/admin/ebook/issues");
}

export async function getEbookArticles(
  date: string,
  status: "all" | "unverified" | "approved" | "flagged" = "all",
  page = 1,
): Promise<{ items: EbookArticle[]; total: number; pageSize: number }> {
  const p = new URLSearchParams({ date, status, page: String(page) });
  return apiFetch(`/api/admin/ebook/articles?${p}`);
}

export async function verifyEbookArticle(
  idxno: number,
  status: VerifyStatus,
  note?: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/ebook/verify/${idxno}`, {
    method: "POST",
    body: JSON.stringify({ status, note }),
  });
}
