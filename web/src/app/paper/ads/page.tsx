// 옛 광고 — 지면 광고를 연도·갈래로 훑는다.
//   기사 검색에서는 빼지만(섞이면 노이즈) 자료로는 남긴다. 1990~2001년 태안의 전세·매매가와
//   구인 임금이 여기 있고, 군청 통계에도 없는 읍면 단위 시세다.
import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AdsClient } from "./ads-client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "옛 광고 — 주간태안신문 지면 광고 모음",
  description: "1990~2001년 주간태안신문에 실린 부동산·구인·상점 광고. 그 시절 태안의 전세·매매가와 임금이 그대로 남아 있습니다.",
  alternates: { canonical: "/paper/ads" },
};

export default async function AdsPage() {
  let years: Array<{ year: number; n: number }> = [];
  try {
    const res = await fetch(`${API_BASE}/api/archive/ads/years`, { next: { revalidate: 86400 } });
    if (res.ok) years = ((await res.json()) as { years?: Array<{ year: number; n: number }> }).years ?? [];
  } catch { /* 조회 실패 → 빈 목록 */ }

  const total = years.reduce((s, y) => s + y.n, 0);

  return (
    <div>
      <PageHeader
        eyebrow={<Link href="/news" className="text-accent underline">← 뉴스아카이브</Link>}
        title="🏷 옛 광고"
        description="그 시절 태안의 집값·월세·품삯이 그대로 남아 있는 지면 광고입니다."
        actions={
          <Link href="/paper/prices"
            className="rounded-full border border-brand/25 px-4 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5">
            💰 옛날 물가 보기
          </Link>
        }
      />
      {total > 0 && (
        <p className="mb-6 text-sm text-foreground-muted">
          {years[0]?.year}~{years[years.length - 1]?.year}년 · {total.toLocaleString()}건
        </p>
      )}
      {years.length === 0
        ? <p className="text-sm text-foreground-muted">아직 정리된 광고가 없습니다.</p>
        : <AdsClient years={years} />}
    </div>
  );
}
