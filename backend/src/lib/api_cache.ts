// 범용 D1 API 캐시(stale-while-revalidate) — workers.dev 엣지캐시 불가 대응(db/020).

export interface CacheRead<T> { value: T; ageMs: number }

export async function readCache<T>(db: D1Database, key: string): Promise<CacheRead<T> | null> {
  try {
    const r = await db.prepare("SELECT value, updated_at FROM api_cache WHERE key=?1").bind(key).first<{ value: string; updated_at: string }>();
    if (!r) return null;
    return { value: JSON.parse(r.value) as T, ageMs: Date.now() - Date.parse(r.updated_at) };
  } catch { return null; }
}

export async function writeCache<T>(db: D1Database, key: string, value: T): Promise<void> {
  try {
    await db.prepare("INSERT INTO api_cache (key,value,updated_at) VALUES (?1,?2,?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(key, JSON.stringify(value), new Date().toISOString()).run();
  } catch { /* 캐시 실패 무시 */ }
}
