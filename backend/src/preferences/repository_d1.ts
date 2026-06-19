// 선호도·즐겨찾기 D1 영속 저장소 — taean-archive(ARCHIVE_DB). migration 014.
// InMemory 구현체와 동일 인터페이스 → 라우터에서 교체만.

import type { PreferencesRepository, FavoritesRepository } from "./repository";
import type { UserPreferences, UserFavorite, InterestCategory, NotificationChannel, UserSegment } from "./types";

const parseArr = <T>(s: string | null): T[] => {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? (v as T[]) : []; } catch { return []; }
};

interface PrefRow {
  user_id: string;
  segment: string;
  regions: string;
  categories: string;
  notification_channels: string;
  onboarded_at: string | null;
  updated_at: string;
}

export class D1PreferencesRepo implements PreferencesRepository {
  constructor(private db: D1Database) {}

  async get(userId: string): Promise<UserPreferences | null> {
    const r = await this.db.prepare("SELECT * FROM user_preferences WHERE user_id=?1").bind(userId).first<PrefRow>();
    if (!r) return null;
    return {
      userId: r.user_id,
      segment: r.segment as UserSegment,
      regions: parseArr<string>(r.regions),
      categories: parseArr<InterestCategory>(r.categories),
      notificationChannels: parseArr<NotificationChannel>(r.notification_channels),
      onboardedAt: r.onboarded_at ?? undefined,
      updatedAt: r.updated_at,
    };
  }

  async upsert(prefs: UserPreferences): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO user_preferences (user_id, segment, regions, categories, notification_channels, onboarded_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(user_id) DO UPDATE SET
           segment=excluded.segment, regions=excluded.regions, categories=excluded.categories,
           notification_channels=excluded.notification_channels, onboarded_at=excluded.onboarded_at,
           updated_at=excluded.updated_at`,
      )
      .bind(
        prefs.userId, prefs.segment, JSON.stringify(prefs.regions), JSON.stringify(prefs.categories),
        JSON.stringify(prefs.notificationChannels), prefs.onboardedAt ?? null, new Date().toISOString(),
      )
      .run();
  }
}

interface FavRow {
  id: string;
  user_id: string;
  kind: string;
  ref_id: string;
  label: string | null;
  metadata: string | null;
  created_at: string;
}

export class D1FavoritesRepo implements FavoritesRepository {
  constructor(private db: D1Database) {}

  private toFav(r: FavRow): UserFavorite {
    return {
      id: r.id, userId: r.user_id, kind: r.kind as UserFavorite["kind"], refId: r.ref_id,
      label: r.label ?? undefined,
      metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : undefined,
      createdAt: r.created_at,
    };
  }

  async list(userId: string): Promise<UserFavorite[]> {
    const res = await this.db.prepare("SELECT * FROM user_favorites WHERE user_id=?1 ORDER BY created_at DESC").bind(userId).all<FavRow>();
    return (res.results ?? []).map((r) => this.toFav(r));
  }
  async add(f: UserFavorite): Promise<void> {
    await this.db
      .prepare("INSERT OR REPLACE INTO user_favorites (id, user_id, kind, ref_id, label, metadata, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)")
      .bind(f.id, f.userId, f.kind, f.refId, f.label ?? null, f.metadata ? JSON.stringify(f.metadata) : null, f.createdAt)
      .run();
  }
  async remove(userId: string, favoriteId: string): Promise<void> {
    await this.db.prepare("DELETE FROM user_favorites WHERE id=?1 AND user_id=?2").bind(favoriteId, userId).run();
  }
  async count(userId: string): Promise<number> {
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM user_favorites WHERE user_id=?1").bind(userId).first<{ n: number }>();
    return r?.n ?? 0;
  }
}
