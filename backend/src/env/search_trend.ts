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
  lodging: { latest: number; prev: number; deltaPct: number } | null; // 숙박 검색 선행 proxy
}

// 숙박 수요 선행 proxy — '태안 펜션/숙박/캠핑' 검색량(예약 전 검색). 실예약률 대용.
const LODGING_KEYWORDS = ["태안 펜션", "태안 숙박", "안면도 펜션", "태안 캠핑", "만리포 펜션"];

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function fetchSearchTrendImpl(env: { NAVER_CLIENT_ID?: string; NAVER_CLIENT_SECRET?: string; NAVER_DATALAB_ID?: string; NAVER_DATALAB_SECRET?: string }): Promise<SearchTrend | null> {
  // 데이터랩 검색어트렌드는 전용 앱 키(NAVER_DATALAB_*)가 있으면 우선 — 기존 로그인 앱과 API 조합 불가하므로 분리.
  const cid = env.NAVER_DATALAB_ID || env.NAVER_CLIENT_ID;
  const csecret = env.NAVER_DATALAB_SECRET || env.NAVER_CLIENT_SECRET;
  if (!cid || !csecret) return null;
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const start = new Date(now.getTime() - 70 * 86400000); // 약 10주
  try {
    const res = await fetch(DATALAB, {
      method: "POST",
      headers: {
        "X-Naver-Client-Id": cid,
        "X-Naver-Client-Secret": csecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: ymd(start), endDate: ymd(now), timeUnit: "week",
        keywordGroups: [
          { groupName: REGION.searchGroupName, keywords: KEYWORDS },
          { groupName: "태안숙박", keywords: LODGING_KEYWORDS },
        ],
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
    // 숙박 그룹(results[1])
    const ld = j.results?.[1]?.data ?? [];
    let lodging: SearchTrend["lodging"] = null;
    if (ld.length >= 2) {
      const lLatest = Math.round(ld[ld.length - 1].ratio * 10) / 10;
      const lPrev = Math.round(ld[ld.length - 2].ratio * 10) / 10;
      lodging = { latest: lLatest, prev: lPrev, deltaPct: lPrev > 0 ? Math.round(((lLatest - lPrev) / lPrev) * 100) : 0 };
    }
    return { latest, prev, deltaPct, weeks, lodging };
  } catch {
    return null;
  }
}

// 60분 캐시 + 동시호출 dedup (수요지수·트렌드 스트립에서 중복 호출)
export const fetchSearchTrend = makeTtlCache(fetchSearchTrendImpl, 60 * 60_000);
