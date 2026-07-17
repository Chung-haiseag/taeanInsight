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
