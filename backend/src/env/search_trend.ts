// 검색 관심도 선행지표 — 네이버 데이터랩 검색어트렌드(상대값 0~100).
//   "태안/꽃지/만리포/안면도" 주간 검색량 추세 → 관광 수요의 선행 신호.
//   절대 검색수는 비공개. 비율의 주간 증감(WoW)을 사용.

import { REGION } from "../region";
import { makeTtlCache } from "../lib/cache";

const DATALAB = "https://openapi.naver.com/v1/datalab/search";
const KEYWORDS = REGION.searchKeywords;

export interface SearchTrend {
  latest: number;          // 최근 주 비율
  prev: number;            // 직전 주 비율
  deltaPct: number;        // 전주 대비 % 증감
  weeks: Array<{ period: string; ratio: number }>;
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function fetchSearchTrendImpl(env: { NAVER_CLIENT_ID?: string; NAVER_CLIENT_SECRET?: string }): Promise<SearchTrend | null> {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) return null;
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const start = new Date(now.getTime() - 70 * 86400000); // 약 10주
  try {
    const res = await fetch(DATALAB, {
      method: "POST",
      headers: {
        "X-Naver-Client-Id": env.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: ymd(start), endDate: ymd(now), timeUnit: "week",
        keywordGroups: [{ groupName: REGION.searchGroupName, keywords: KEYWORDS }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: Array<{ data?: Array<{ period: string; ratio: number }> }> };
    const data = j.results?.[0]?.data ?? [];
    if (data.length < 2) return null;
    const weeks = data.map((d) => ({ period: d.period, ratio: Math.round(d.ratio * 10) / 10 }));
    const latest = weeks[weeks.length - 1].ratio;
    const prev = weeks[weeks.length - 2].ratio;
    const deltaPct = prev > 0 ? Math.round(((latest - prev) / prev) * 100) : 0;
    return { latest, prev, deltaPct, weeks };
  } catch {
    return null;
  }
}

// 60분 캐시 + 동시호출 dedup (수요지수·트렌드 스트립에서 중복 호출)
export const fetchSearchTrend = makeTtlCache(fetchSearchTrendImpl, 60 * 60_000);
