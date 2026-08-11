import type { MetadataRoute } from "next";

// robots — 사이트맵을 연도별 청크 URL로 직접 나열한다. Next의 generateSitemaps는 OpenNext에서 인덱스
//   (/sitemap.xml)를 자동 생성하지 않아, 인덱스 대신 robots에 전 청크를 열거해 검색엔진이 모두 크롤하게 한다.
const SITE = "https://axtaeannews.co.kr";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export const revalidate = 86400;

export default async function robots(): Promise<MetadataRoute.Robots> {
  let years: number[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/news/sitemap-years`, { next: { revalidate: 86400 } });
    if (res.ok) years = ((await res.json()).years ?? []) as number[];
  } catch { /* 실패 시 정적 청크만 안내 */ }
  const sitemap = [`${SITE}/sitemap/0.xml`, ...years.map((y) => `${SITE}/sitemap/${y}.xml`)];
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap,
  };
}
