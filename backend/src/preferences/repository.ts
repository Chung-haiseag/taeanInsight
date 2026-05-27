// 사용자 선호 영구 저장소 추상화
// PRD v1.8 §6 REQ-PRODUCT-005 — DB 연결 시 구현체만 교체

import type {
  B2gMembership,
  UserFavorite,
  UserPreferences,
} from "./types";

export interface PreferencesRepository {
  get(userId: string): Promise<UserPreferences | null>;
  upsert(prefs: UserPreferences): Promise<void>;
}

export interface FavoritesRepository {
  list(userId: string): Promise<UserFavorite[]>;
  add(favorite: UserFavorite): Promise<void>;
  remove(userId: string, favoriteId: string): Promise<void>;
  count(userId: string): Promise<number>;
}

export interface B2gMembershipRepository {
  listByUser(userId: string): Promise<B2gMembership[]>;
}

// ---------- 인메모리 구현체 (테스트·PoC) ----------

export class InMemoryPreferencesRepo implements PreferencesRepository {
  records = new Map<string, UserPreferences>();
  async get(userId: string): Promise<UserPreferences | null> {
    return this.records.get(userId) ?? null;
  }
  async upsert(prefs: UserPreferences): Promise<void> {
    this.records.set(prefs.userId, { ...prefs, updatedAt: new Date().toISOString() });
  }
}

export class InMemoryFavoritesRepo implements FavoritesRepository {
  records = new Map<string, UserFavorite>();

  async list(userId: string): Promise<UserFavorite[]> {
    return Array.from(this.records.values()).filter((f) => f.userId === userId);
  }
  async add(favorite: UserFavorite): Promise<void> {
    this.records.set(favorite.id, favorite);
  }
  async remove(userId: string, favoriteId: string): Promise<void> {
    const f = this.records.get(favoriteId);
    if (f && f.userId === userId) this.records.delete(favoriteId);
  }
  async count(userId: string): Promise<number> {
    return (await this.list(userId)).length;
  }
}

export class InMemoryB2gMembershipRepo implements B2gMembershipRepository {
  records: B2gMembership[] = [];
  async listByUser(userId: string): Promise<B2gMembership[]> {
    return this.records.filter((m) => m.userId === userId);
  }
}
