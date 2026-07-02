import type { MetadataRoute } from "next";

const SITE = "https://insight.taeannews.co.kr";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = ["", "/news", "/archive", "/reports", "/query", "/live", "/citizen"].map((p) => ({
    url: `${SITE}${p}`,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.7,
  }));

  let articles: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_BASE}/api/news`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      articles = (data.items ?? []).slice(0, 100).map((a: { id: string; publishedAt?: string }) => ({
        url: `${SITE}/news/${a.id}`,
        lastModified: a.publishedAt ? new Date(a.publishedAt.replace(" ", "T")) : undefined,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    }
  } catch { /* 무시 */ }

  return [...staticPages, ...articles];
}
