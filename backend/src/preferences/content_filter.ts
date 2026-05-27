// 콘텐츠 등급(Critical/Community/Personal) × 사용자 관심사 결합 필터
// PRD v1.8 §6 REQ-PRODUCT-005 — 백엔드는 공통 캐시 데이터 반환,
// 프론트엔드에서 이 필터로 사용자별 노출 결정 (캐싱 75% 보호)

import type { InterestCategory, UserPreferences } from "./types";

export type VisibilityTier = "critical" | "community" | "personal";

export interface FilterableContent {
  id: string;
  visibilityTier: VisibilityTier;
  category?: InterestCategory;
  region?: string;                 // 읍·면 코드
  publishedAt?: string;
}

export type ContentVisibility = "show" | "show_small" | "hide";

export interface FilterDecision<T extends FilterableContent> {
  content: T;
  visibility: ContentVisibility;
  reason: string;
}

/**
 * 단일 콘텐츠에 대한 노출 결정.
 *
 * 규칙 (v1.8):
 * - critical: 무조건 show (필터 버블 방지, 지역 공동체 정보)
 * - community: 관심 분야 일치 시 show, 불일치 시 show_small (작게 노출)
 * - personal: 관심 분야 + 관심 지역 모두 일치 시 show, 둘 다 일치 안 하면 hide
 */
export function decideVisibility<T extends FilterableContent>(
  content: T,
  prefs: UserPreferences,
): FilterDecision<T> {
  if (content.visibilityTier === "critical") {
    return { content, visibility: "show", reason: "critical_tier_always_shown" };
  }

  const categoryMatch = !content.category || prefs.categories.includes(content.category);
  const regionMatch = !content.region || prefs.regions.includes(content.region);

  if (content.visibilityTier === "community") {
    return categoryMatch
      ? { content, visibility: "show", reason: "community_category_match" }
      : { content, visibility: "show_small", reason: "community_tier_minimum_exposure" };
  }

  // personal
  if (categoryMatch && regionMatch) {
    return { content, visibility: "show", reason: "personal_full_match" };
  }
  if (categoryMatch || regionMatch) {
    return { content, visibility: "show_small", reason: "personal_partial_match" };
  }
  return { content, visibility: "hide", reason: "personal_no_match" };
}

/**
 * 다수 콘텐츠를 필터링한 결과 — show/show_small/hide로 분류.
 * 프론트엔드는 show를 메인에, show_small을 본문 하단 카드에 표시.
 */
export function filterForUser<T extends FilterableContent>(
  items: T[],
  prefs: UserPreferences,
): { primary: T[]; secondary: T[]; hidden: T[] } {
  const primary: T[] = [];
  const secondary: T[] = [];
  const hidden: T[] = [];

  for (const it of items) {
    const decision = decideVisibility(it, prefs);
    if (decision.visibility === "show") primary.push(it);
    else if (decision.visibility === "show_small") secondary.push(it);
    else hidden.push(it);
  }
  return { primary, secondary, hidden };
}

/** 정렬 — primary는 최신순, 그 다음 community/critical 위치 (UI 정책) */
export function sortByRecency<T extends FilterableContent>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aT = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bT = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bT - aT;
  });
}
