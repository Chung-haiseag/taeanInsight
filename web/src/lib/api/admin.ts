// 관리자 대시보드 API 클라이언트 — backend/src/cost/router.ts 등과 매핑
// 운영자(내부)용. 실제 데이터는 백엔드 인메모리 PoC라 워커 재시작 시 초기화됨.

import { apiFetch } from "./client";

// backend/src/types.ts 의 MonthlyReport 와 형태 일치
export interface MonthlyCostReport {
  month: string; // "2026-06"
  totalKrw: number;
  limitKrw: number;
  ratio: number; // totalKrw / limitKrw
  byCategory: Record<string, number>;
  byVendor: Record<string, number>;
  thresholdsCrossed: number[]; // 이번 달 이미 초과된 임계값 [0.7, 0.9, ...]
}

export async function getCostSummary(): Promise<MonthlyCostReport> {
  return apiFetch<MonthlyCostReport>("/api/cost/summary");
}

// 운영·분석 대시보드 (backend/src/analytics/router.ts)
export interface AnalyticsData {
  reads: { total: number; readers: number; avgDwellSec: number; avgScrollPct: number };
  topArticles: { idxno: number; title: string; reads: number; avgDwellSec: number }[];
  byCategory: { category: string; reads: number }[];
  daily: { day: string; reads: number }[];
  audience: { onboarded: number; pushSubs: number };
  segments: { segment: string; n: number }[];
  usage?: {
    audioPlays: number; aiQueries: number;
    audioByRef: { ref: string; n: number }[];
    topQueries: { ref: string; n: number }[];
  };
  generatedAt: string;
}
export async function getAnalytics(): Promise<AnalyticsData> {
  return apiFetch<AnalyticsData>("/api/admin/analytics");
}
