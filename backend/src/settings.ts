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
// AI가 쓴 인물 소개를 공개할지. ⚠ **기본값이 off다** — 줄이 없으면 끈 것으로 본다.
//   집계·기사 목록은 '아카이브에 있는 것을 세어 보여주는 것'이라 반박이 곧 확인이지만,
//   생성문은 근거를 댈 수 없다. 지역 실명 인물이라 켜는 쪽이 결정이어야 한다(2026-09-01).
export const SETTING_PUBLIC_PERSON_BIO = "public_person_bio";
