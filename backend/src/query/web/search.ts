// 웹 보강 RAG — 화이트리스트 웹 검색(Tavily). 검색+본문추출 1콜, 6시간 D1 캐시, fail-open.
// Brave 등 다른 provider로 교체 시 이 파일의 fetch만 바꾸면 됨(반환 계약 동일).

import type { Env } from "../../types";
import { readCache, writeCache } from "../../lib/api_cache";
import { WEB_WHITELIST, isAllowedDomain } from "./whitelist";

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
  const key = (env as Env & { WEB_SEARCH_API_KEY?: string }).WEB_SEARCH_API_KEY;
  if (!key) return []; // 키 없으면 웹 보강 비활성

  const cacheKey = `web:${query.trim().toLowerCase().slice(0, 200)}`;
  if (env.ARCHIVE_DB) {
    const cached = await readCache<WebSource[]>(env.ARCHIVE_DB, cacheKey);
    if (cached && cached.ageMs < CACHE_TTL_MS) return cached.value;
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: MAX_RESULTS,
        include_domains: WEB_WHITELIST,
        search_depth: "basic",
      }),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { results?: unknown };
    const sources = mapTavily(j.results).slice(0, MAX_RESULTS);
    if (env.ARCHIVE_DB && sources.length) await writeCache(env.ARCHIVE_DB, cacheKey, sources);
    return sources;
  } catch {
    return []; // fail-open
  }
}
