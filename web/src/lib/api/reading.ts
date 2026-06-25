// 독자 행동 초개인화(Phase 1) — 읽기 이벤트 비콘 + 관심사 피드.
// 이벤트는 keepalive fetch(언로드 시에도 전송). 식별은 익명 uid 헤더.

import { apiFetch } from "./client";
import { getUid } from "../uid";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export interface ReadingFeed {
  hasData: boolean;
  readerType: "heavy" | "scanner" | "balanced";
  topCategories: string[];
  recentIdxnos: number[];
}

// 읽기 종료 시 1회 전송(페이지 떠나도 keepalive로 전달)
export function sendReadingEvent(input: { idxno: number; category?: string; dwellMs: number; scrollPct: number }): void {
  try {
    const uid = getUid();
    if (!uid || input.dwellMs < 1500) return;
    void fetch(`${API_BASE}/api/reading/event`, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", "X-Taean-Uid": uid },
      body: JSON.stringify(input),
    }).catch(() => {});
  } catch { /* 무시 */ }
}

export function getReadingFeed(): Promise<ReadingFeed> {
  return apiFetch<ReadingFeed>("/api/reading/feed");
}
