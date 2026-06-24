// 초개인화 사용자 선호 — DB user_preferences·user_favorites·b2g_memberships와 매핑
// PRD v1.8 §6 REQ-PRODUCT-005 + DB 004_personalization_and_b2g.sql

export type UserSegment = "b2c_basic" | "b2c_premium" | "b2b_basic" | "b2b_premium" | "b2g";

export type InterestCategory =
  | "tourism" | "environment" | "realestate" | "policy" | "industry" | "culture";

export type NotificationChannel = "email" | "webpush" | "kakao";

// 사장님 초개인화용 가게 프로필 — OwnerHome 실행 제안을 업종/지역 맞춤으로.
export type ShopIndustry = "lodging" | "food" | "cafe" | "leisure" | "retail" | "fishing" | "salt" | "farming" | "travel" | "realtor" | "golf" | "aqua" | "other";
export interface ShopProfile {
  industry: ShopIndustry;
  eupMyeon?: string;                // 가게 읍·면 코드(없으면 regions[0] 사용)
  capacity?: number;               // 객실/좌석 수(선택)
  name?: string;                   // 상호(선택)
  basePrice?: number;              // (숙박) 평일 기본 객실가(원)
  weekendPrice?: number;           // (숙박) 주말 기본 객실가(원)
}

export interface UserPreferences {
  userId: string;
  segment: UserSegment;
  regions: string[];                // 읍·면 코드 (anmyeon·geunheung 등)
  categories: InterestCategory[];
  notificationChannels: NotificationChannel[];
  shopProfile?: ShopProfile;        // 사장님 가게 정보(초개인화)
  onboardedAt?: string;             // ISO 8601, 미설정 = 온보딩 미완료
  updatedAt: string;
}

export type FavoriteKind = "place" | "event" | "report" | "article" | "dashboard_widget";

export interface UserFavorite {
  id: string;
  userId: string;
  kind: FavoriteKind;
  refId: string;
  label?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface B2gMembership {
  userId: string;
  orgId: string;
  orgName: string;
  orgType: "county" | "eup_myeon" | "education" | "research" | "other";
  role: "admin" | "member";
}

// 세그먼트별 한도 (DB segment_limits 시드와 동기화)
export const SEGMENT_LIMITS: Record<UserSegment, {
  maxRegions: number;
  maxCategories: number;
  maxFavorites: number;
  maxTeamMembers: number;
  premiumPdf: boolean;
}> = {
  b2c_basic:   { maxRegions: 2, maxCategories: 2, maxFavorites: 10,  maxTeamMembers: 1,  premiumPdf: false },
  b2c_premium: { maxRegions: 5, maxCategories: 4, maxFavorites: 50,  maxTeamMembers: 1,  premiumPdf: true  },
  b2b_basic:   { maxRegions: 5, maxCategories: 4, maxFavorites: 100, maxTeamMembers: 3,  premiumPdf: true  },
  b2b_premium: { maxRegions: 10, maxCategories: 6, maxFavorites: 200, maxTeamMembers: 10, premiumPdf: true  },
  b2g:         { maxRegions: 5, maxCategories: 6, maxFavorites: 500, maxTeamMembers: 20, premiumPdf: true  },
};

// 한도 위반 검증
export interface PreferenceLimitsViolation {
  field: "regions" | "categories" | "favorites";
  limit: number;
  attempted: number;
}

export function checkLimits(
  segment: UserSegment,
  patch: Partial<Pick<UserPreferences, "regions" | "categories">>,
): PreferenceLimitsViolation[] {
  const limits = SEGMENT_LIMITS[segment];
  const violations: PreferenceLimitsViolation[] = [];
  if (patch.regions && patch.regions.length > limits.maxRegions) {
    violations.push({ field: "regions", limit: limits.maxRegions, attempted: patch.regions.length });
  }
  if (patch.categories && patch.categories.length > limits.maxCategories) {
    violations.push({ field: "categories", limit: limits.maxCategories, attempted: patch.categories.length });
  }
  return violations;
}
