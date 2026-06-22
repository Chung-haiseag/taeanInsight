"use client";

// 홈 라이브 요약 — 비로그인 첫 화면에 "지금 태안" 핵심 지표를 보여줘 즉시 가치 전달.
// metrics 엔드포인트(백엔드 30분 스냅샷+엣지캐시)라 가볍고 빠름. 데이터 없으면 렌더 안 함.

import { useEffect, useState } from "react";
import Link from "next/link";

import { fetchReportMetrics, type ReportMetrics } from "@/lib/api/reports";
import { SummaryInfographic } from "@/components/reports/report-charts";

export function LiveSummaryStrip() {
  const [metrics, setMetrics] = useState<ReportMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReportMetrics().then((m) => { if (!cancelled) setMetrics(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!metrics) return null;

  return (
    <section aria-labelledby="live-home-heading" className="hairline pt-8">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Live</p>
          <h2 id="live-home-heading" className="mt-2 text-display-sm font-bold text-brand">지금 태안</h2>
        </div>
        <Link href="/live" className="text-sm font-semibold text-accent hover:underline">실시간 현황 전체 →</Link>
      </div>
      <SummaryInfographic metrics={metrics} />
    </section>
  );
}
