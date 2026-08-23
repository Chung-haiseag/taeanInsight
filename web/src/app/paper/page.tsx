// 과거신문 — 연도 고르기. 지면 스캔 7,343장을 넣어두고도 들어갈 길이 없어 새로 낸 문패다.
import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "과거신문 — 주간태안신문 지면 보기",
  description: "1990~2001년 주간태안신문 지면을 그대로 넘겨봅니다. 발행일과 면을 골라 원본 스캔을 확대해 읽을 수 있습니다.",
  alternates: { canonical: "/paper" },
};

interface Year { year: number; issues: number; pages: number; articles: number }

export default async function PaperIndex() {
  let years: Year[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/archive/papers/years`, { next: { revalidate: 86400 } });
    if (res.ok) years = ((await res.json()) as { years?: Year[] }).years ?? [];
  } catch { /* 조회 실패 → 빈 목록 */ }

  const total = years.reduce((s, y) => s + y.pages, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        title="📰 과거신문"
        description="주간태안신문 지면을 그대로 넘겨봅니다. 연도를 고르면 발행일이 나옵니다."
      />

      {years.length > 0 && (
        <p className="mb-6 text-sm text-foreground-muted">
          {years[0].year}~{years[years.length - 1].year}년 · 지면 {total.toLocaleString()}장
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {years.map((y) => (
          <li key={y.year}>
            <Link
              href={`/paper/${y.year}`}
              className="block rounded-lg border border-brand/15 bg-background p-4 transition hover:border-brand/40 hover:bg-accent-subtle/20"
            >
              <p className="text-xl font-bold text-brand">{y.year}년</p>
              <p className="mt-1 text-sm text-foreground-muted">
                {y.issues}호 · {y.pages}면
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {years.length === 0 && <p className="text-sm text-foreground-muted">지면 목록을 불러오지 못했습니다.</p>}
    </main>
  );
}
