// 프론트엔드 ↔ 백엔드 공유 타입 (backend/src/preferences/types.ts와 동기화)
// PRD v1.8 §6 REQ-PRODUCT-005

import { FRONT_REGION } from "./region";

export type UserSegment = "b2c_basic" | "b2c_premium" | "b2b_basic" | "b2b_premium" | "b2g";

export type InterestCategory =
  | "tourism" | "environment" | "realestate" | "policy" | "industry" | "culture";

export type NotificationChannel = "email" | "webpush" | "kakao";

export type FavoriteKind = "place" | "event" | "report" | "article" | "dashboard_widget";

export interface ShopProfile {
  industry: "lodging" | "food" | "cafe" | "leisure" | "retail" | "fishing" | "salt" | "farming" | "travel" | "realtor" | "golf" | "aqua" | "other";
  eupMyeon?: string;
  capacity?: number;
  name?: string;
  basePrice?: number;
  weekendPrice?: number;
}
export interface UserPreferences {
  userId: string;
  segment: UserSegment;
  regions: string[];
  categories: InterestCategory[];
  notificationChannels: NotificationChannel[];
  shopProfile?: ShopProfile;
  onboardedAt?: string;
  updatedAt: string;
}

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

export interface MeResponse {
  onboarded: boolean;
  segment?: UserSegment;
  preferences?: UserPreferences;
  favorites?: UserFavorite[];
  b2gMemberships?: B2gMembership[];
}

// ── 부가상품(add-on) — backend/src/payments/addons.ts 와 동기화 ──
export type AddonKey = "owner_pro";

export interface AddonProduct {
  key: AddonKey;
  name: string;
  description: string;
  priceKrw: number;
  benefits: string[];
}

export interface AddonEntitlement {
  key: AddonKey;
  active: boolean;
}

// UI 라벨
export const CATEGORY_LABELS: Record<InterestCategory, string> = {
  tourism: "관광",
  environment: "환경",
  realestate: "부동산",
  policy: "정책",
  industry: "산업",
  culture: "문화",
};

// 읍·면 — 지역설정(region.ts)에서 파생(코드는 backend region.ts와 일치)
export const REGION_OPTIONS: Array<{ code: string; label: string }> = FRONT_REGION.eupMyeon;

// 세그먼트별 한도 (백엔드 SEGMENT_LIMITS와 동기화)
export const SEGMENT_LIMITS: Record<UserSegment, {
  maxRegions: number;
  maxCategories: number;
  maxFavorites: number;
  premiumPdf: boolean;
  label: string;
}> = {
  b2c_basic:   { maxRegions: 2,  maxCategories: 2, maxFavorites: 10,  premiumPdf: false, label: "B2C Basic" },
  b2c_premium: { maxRegions: 5,  maxCategories: 4, maxFavorites: 50,  premiumPdf: true,  label: "B2C Premium" },
  b2b_basic:   { maxRegions: 5,  maxCategories: 4, maxFavorites: 100, premiumPdf: true,  label: "B2B 기본" },
  b2b_premium: { maxRegions: 10, maxCategories: 6, maxFavorites: 200, premiumPdf: true,  label: "B2B 프리미엄" },
  b2g:         { maxRegions: 5,  maxCategories: 6, maxFavorites: 500, premiumPdf: true,  label: "B2G 공공기관" },
};

// 톤 매핑
export function preferredTone(segment: UserSegment): "warm" | "tool" {
  return segment === "b2c_basic" || segment === "b2c_premium" ? "warm" : "tool";
}

// 톤 토글 허용 (B2C Premium만)
export function canToggleTone(segment: UserSegment): boolean {
  return segment === "b2c_premium";
}
