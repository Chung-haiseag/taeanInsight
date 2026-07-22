// 웹 보강 RAG — 화이트리스트 웹 검색. provider: 네이버(뉴스+웹문서) 우선, 없으면 Tavily.
// 6시간 D1 캐시, fail-open. 다른 provider 교체 시 반환 계약(WebSource[])만 지키면 됨.

import type { Env } from "../../types";
import { readCache, writeCache } from "../../lib/api_cache";
import { WEB_WHITELIST, isAllowedDomain } from "./whitelist";
import { searchNaver } from "./naver";

export interface WebSource {
  url: string;
  title: string;
  text: string;
  publishedAt?: string;
}

const TEXT_CAP = 1500;
const MAX_RESULTS = 3;
const CACHE_TTL_MS = 6 * 3600_000;

// Tavily 응답 → WebSource[] (화이트리스트 필터 + 본문 cap). 순수.
export function mapTavily(results: unknown, cap = TEXT_CAP): WebSource[] {
  if (!Array.isArray(results)) return [];
  const out: WebSource[] = [];
  for (const r of results as Array<Record<string, unknown>>) {
    const url = typeof r.url === "string" ? r.url : "";
    const title = typeof r.title === "string" ? r.title : "";
    if (!url || !title || !isAllowedDomain(url)) continue;
    out.push({
      url,
      title,
      text: (typeof r.content === "string" ? r.content : "").slice(0, cap),
      publishedAt: typeof r.published_date === "string" ? r.published_date : undefined,
    });
  }
  return out;
}

export async function searchWeb(env: Env, query: string): Promise<WebSource[]> {
  const e = env as Env & {
    WEB_SEARCH_API_KEY?: string;
    NAVER_CLIENT_ID?: string;
    NAVER_CLIENT_SECRET?: string;
  };
  const naver = e.NAVER_CLIENT_ID && e.NAVER_CLIENT_SECRET;
  const tavily = e.WEB_SEARCH_API_KEY;
  if (!naver && !tavily) return []; // provider 없으면 웹 보강 비활성

  const cacheKey = `web:${query.trim().toLowerCase().slice(0, 200)}`;
  if (env.ARCHIVE_DB) {
    const cached = await readCache<WebSource[]>(env.ARCHIVE_DB, cacheKey);
    if (cached && cached.ageMs < CACHE_TTL_MS) return cached.value;
  }

  try {
    let sources: WebSource[];
    if (naver) {
      sources = await searchNaver(e.NAVER_CLIENT_ID!, e.NAVER_CLIENT_SECRET!, query, MAX_RESULTS);
    } else {
      // Tavily: 검색+본문추출 1콜, 6s 타임아웃 초과 시 로컬 폴백(abort → catch → [])
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: tavily,
          query,
          max_results: MAX_RESULTS,
          include_domains: WEB_WHITELIST,
          search_depth: "basic",
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return [];
      const j = (await res.json()) as { results?: unknown };
      sources = mapTavily(j.results).slice(0, MAX_RESULTS);
    }
    if (env.ARCHIVE_DB && sources.length) await writeCache(env.ARCHIVE_DB, cacheKey, sources);
    return sources;
  } catch {
    return []; // fail-open
  }
}
