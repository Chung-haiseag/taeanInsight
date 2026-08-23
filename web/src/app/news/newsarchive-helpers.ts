// 통합 뉴스아카이브 — 순수 헬퍼(테스트 대상). React/네트워크 의존 없음.

// 탭 표시 순서(아카이브 카테고리 값과 일치).
export const CATEGORY_ORDER = [
  "tourism",
  "environment",
  "industry",
  "policy",
  "realestate",
  "culture",
  "society",
] as const;

// 관심분야 카테고리를 앞으로 정렬. JS sort는 안정 정렬이라 그룹 내 원래 순서 보존.
export function sortCategoryTabs(available: readonly string[], interests: readonly string[]): string[] {
  const set = new Set(interests);
  return [...available].sort((a, b) => Number(set.has(b)) - Number(set.has(a)));
}

export interface ListState { q: string; cat: string; year: string; page: number }

/**
 * 지금 보고 있는 목록 상태 → 주소 문자열(순수).
 *
 *   기사에서 뒤로 오면 브라우저는 **떠날 때의 주소**로 돌아온다. 검색어·페이지가 주소에
 *   없으면 목록이 처음 상태로 다시 세워진다 — 3페이지에서 기사를 열고 뒤로 오면 1페이지였다.
 *   기본값(전체·1페이지·검색어 없음)은 적지 않는다 — 주소가 짧아야 공유하기도 좋다.
 */
export function listUrl(s: ListState): string {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.cat && s.cat !== "all") p.set("cat", s.cat);
  if (s.year) p.set("year", s.year);
  if (s.page > 1) p.set("page", String(s.page));
  const qs = p.toString();
  return qs ? `/news?${qs}` : "/news";
}

/** 주소 → 목록 상태(순수). 없거나 이상한 값은 기본값으로 되돌린다. */
export function listStateFrom(get: (k: string) => string | null): ListState {
  const n = Number(get("page"));
  return {
    q: get("q") ?? "",
    cat: get("cat") || "all",
    year: /^\d{4}$/.test(get("year") ?? "") ? (get("year") as string) : "",
    page: Number.isInteger(n) && n > 0 ? n : 1,
  };
}

/**
 * 목록 스크롤 위치를 기억할 열쇠(순수).
 *   같은 검색·같은 페이지로 돌아왔을 때만 되살려야 한다 — 다른 검색인데 옛 위치로
 *   내려가면 엉뚱한 자리에 떨어진다.
 */
export const scrollKey = (s: ListState) => `news:scroll:${listUrl(s)}`;
