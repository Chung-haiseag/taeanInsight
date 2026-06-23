// 사용자 선호·즐겨찾기 서비스 — 온보딩 + 한도 검증 + 갱신
// PRD v1.8 §6 REQ-PRODUCT-005

import type {
  FavoritesRepository,
  PreferencesRepository,
} from "./repository";
import {
  type InterestCategory,
  type NotificationChannel,
  SEGMENT_LIMITS,
  type UserFavorite,
  type UserPreferences,
  type UserSegment,
  checkLimits,
  type FavoriteKind,
} from "./types";

export class LimitExceededError extends Error {
  constructor(public readonly violations: ReturnType<typeof checkLimits>) {
    super(`Limit exceeded: ${violations.map((v) => `${v.field}>${v.limit}`).join(", ")}`);
    this.name = "LimitExceededError";
  }
}

export interface OnboardInput {
  userId: string;
  segment: UserSegment;
  regions: string[];
  categories: InterestCategory[];
  notificationChannels: NotificationChannel[];
  shopProfile?: import("./types").ShopProfile;
}

export class PreferencesService {
  constructor(
    private prefsRepo: PreferencesRepository,
    private favRepo: FavoritesRepository,
  ) {}

  async onboard(input: OnboardInput): Promise<UserPreferences> {
    const violations = checkLimits(input.segment, {
      regions: input.regions,
      categories: input.categories,
    });
    if (violations.length > 0) {
      throw new LimitExceededError(violations);
    }

    const prefs: UserPreferences = {
      userId: input.userId,
      segment: input.segment,
      regions: dedupe(input.regions),
      categories: dedupe(input.categories),
      notificationChannels: dedupe(input.notificationChannels),
      shopProfile: input.shopProfile,
      onboardedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.prefsRepo.upsert(prefs);
    return prefs;
  }

  async get(userId: string): Promise<UserPreferences | null> {
    return this.prefsRepo.get(userId);
  }

  async update(
    userId: string,
    patch: Partial<Pick<UserPreferences, "regions" | "categories" | "notificationChannels" | "shopProfile">>,
  ): Promise<UserPreferences> {
    const existing = await this.prefsRepo.get(userId);
    if (!existing) throw new Error("preferences_not_found_run_onboarding_first");

    const updated: UserPreferences = {
      ...existing,
      regions: patch.regions ? dedupe(patch.regions) : existing.regions,
      categories: patch.categories ? dedupe(patch.categories) : existing.categories,
      notificationChannels: patch.notificationChannels
        ? dedupe(patch.notificationChannels)
        : existing.notificationChannels,
      shopProfile: patch.shopProfile ?? existing.shopProfile,
      updatedAt: new Date().toISOString(),
    };

    const violations = checkLimits(updated.segment, {
      regions: updated.regions,
      categories: updated.categories,
    });
    if (violations.length > 0) throw new LimitExceededError(violations);

    await this.prefsRepo.upsert(updated);
    return updated;
  }

  /** 세그먼트 변경 (구독 플랜이 바뀔 때 자동 동기화). 새 한도 위반은 자르거나 거부 정책에 맞춤 */
  async changeSegment(userId: string, segment: UserSegment): Promise<UserPreferences> {
    const existing = await this.prefsRepo.get(userId);
    if (!existing) throw new Error("preferences_not_found");

    const limits = SEGMENT_LIMITS[segment];
    const trimmedRegions = existing.regions.slice(0, limits.maxRegions);
    const trimmedCategories = existing.categories.slice(0, limits.maxCategories);

    const updated: UserPreferences = {
      ...existing,
      segment,
      regions: trimmedRegions,
      categories: trimmedCategories,
      updatedAt: new Date().toISOString(),
    };
    await this.prefsRepo.upsert(updated);
    return updated;
  }

  // ---------- 즐겨찾기 ----------

  async addFavorite(
    userId: string,
    kind: FavoriteKind,
    refId: string,
    extra: { label?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<UserFavorite> {
    const prefs = await this.prefsRepo.get(userId);
    if (!prefs) throw new Error("preferences_not_found");

    const current = await this.favRepo.count(userId);
    const max = SEGMENT_LIMITS[prefs.segment].maxFavorites;
    if (current >= max) {
      throw new LimitExceededError([{ field: "favorites", limit: max, attempted: current + 1 }]);
    }

    const favorite: UserFavorite = {
      id: crypto.randomUUID(),
      userId,
      kind,
      refId,
      label: extra.label,
      metadata: extra.metadata,
      createdAt: new Date().toISOString(),
    };
    await this.favRepo.add(favorite);
    return favorite;
  }

  async listFavorites(userId: string): Promise<UserFavorite[]> {
    return this.favRepo.list(userId);
  }

  async removeFavorite(userId: string, favoriteId: string): Promise<void> {
    return this.favRepo.remove(userId, favoriteId);
  }
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
