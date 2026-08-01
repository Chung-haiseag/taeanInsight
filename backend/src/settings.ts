// 런타임 앱 설정(D1 app_settings) — 배포 없이 토글 가능. 방어적(오류 시 fallback).
export async function getSetting(db: D1Database | undefined, key: string, fallback: string): Promise<string> {
  if (!db) return fallback;
  try {
    const r = await db.prepare("SELECT value FROM app_settings WHERE key=?").bind(key).first<{ value: string }>();
    return r?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(key, value, new Date().toISOString())
    .run();
}

// 공개 기능 플래그 키
export const SETTING_PUBLIC_PEOPLE = "public_people";
