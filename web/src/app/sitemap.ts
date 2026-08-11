import type { MetadataRoute } from "next";

// 아카이브 전 기사(10만+)를 검색엔진이 발견하게 — 연도별로 사이트맵을 분할하고 Next가 인덱스(/sitemap.xml)를
//   자동 생성한다. 이전엔 최신 100건만 넣어 99.9%가 미발견이었다. 연도 청킹 이유: idxno가 불연속(전자북
//   9천만대)이라 OFFSET이 느림 → 백엔드가 year 인덱스로 한 해(≤5.5k)만 빠르게 반환.

const SITE = "https://axtaeannews.co.kr";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export const revalidate = 86400; // 하루 1회 재생성(당해 연도 청크가 새 기사 반영)

const STATIC = ["", "/news", "/reports", "/query", "/live", "/people", "/data", "/citizen", "/membership"];

// id=0 → 정적 페이지, id=연도(1990~2026) → 그 해 기사. Next가 이 목록으로 사이트맵 인덱스를 만든다.
export async function generateSitemaps(): Promise<{ id: number }[]> {
  try {
    const res = await fetch(`${API_BASE}/api/news/sitemap-years`, { next: { revalidate: 86400 } });
    const years: number[] = res.ok ? ((await res.json()).years ?? []) : [];
    return [{ id: 0 }, ...years.map((y) => ({ id: y }))];
  } catch {
    return [{ id: 0 }];
  }
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  if (Number(id) === 0) {   // Next가 id를 문자열로 넘길 수 있어 Number()로 정규화
    const staticEntries = STATIC.map((p) => ({
      url: `${SITE}${p}`,
      changeFrequency: "daily" as const,
      priority: p === "" ? 1 : 0.7,
    }));
    // 연도별 아카이브 브라우즈 허브(/archive/<year>) — 크롤러가 내부 링크로 아카이브에 도달.
    let years: number[] = [];
    try {
      const res = await fetch(`${API_BASE}/api/news/sitemap-years`, { next: { revalidate: 86400 } });
      if (res.ok) years = ((await res.json()).years ?? []) as number[];
    } catch { /* 정적만 */ }
    const yearHubs = years.map((y) => ({ url: `${SITE}/archive/${y}`, changeFrequency: "monthly" as const, priority: 0.5 }));
    return [...staticEntries, ...yearHubs];
  }
  try {
    const res = await fetch(`${API_BASE}/api/news/sitemap-ids?year=${id}`, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { ids?: { id: number; publishedAt?: string | null }[] };
    return (data.ids ?? []).map((a) => ({
      url: `${SITE}/news/${a.id}`,
      lastModified: a.publishedAt ? new Date(a.publishedAt.replace(" ", "T")) : undefined,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    }));
  } catch {
    return [];
  }
}
