// 도로 실시간 CCTV — D1 미러 서빙. ITS는 9443 포트라 Worker가 직접 못 닿아,
// 한국IP 로컬 크롤러(tools/cctv/refresh-cctv.mjs)가 ITS cctvInfo를 받아 /ingest로 적재.
// Worker는 cctv_cameras에서 서빙(스트림 URL은 https, 토큰 ~120분 유효 → 크롤러가 주기 갱신).

export interface CctvItem { name: string; url: string; lat: number; lon: number; road: string }

export async function loadCctv(env: { ARCHIVE_DB?: D1Database }): Promise<{ available: boolean; cameras: CctvItem[]; updatedAt: string | null }> {
  if (!env.ARCHIVE_DB) return { available: false, cameras: [], updatedAt: null };
  const r = await env.ARCHIVE_DB
    .prepare("SELECT name, road, lat, lon, stream_url, updated_at FROM cctv_cameras ORDER BY name")
    .all<{ name: string; road: string | null; lat: number; lon: number; stream_url: string; updated_at: string }>();
  const rows = r.results ?? [];
  return {
    available: rows.length > 0,
    cameras: rows.map((x) => ({ name: x.name, url: x.stream_url, lat: x.lat, lon: x.lon, road: x.road ?? "국도" })),
    updatedAt: rows[0]?.updated_at ?? null,
  };
}

export interface CctvIngestRow { id?: string; name: string; road?: string; lat: number; lon: number; url: string }

// 로컬 크롤러 적재 — 전량 교체(스트림 URL 갱신).
export async function ingestCctv(db: D1Database, cameras: CctvIngestRow[]): Promise<number> {
  const now = new Date().toISOString();
  await db.prepare("DELETE FROM cctv_cameras").run();
  let n = 0;
  for (const c of cameras) {
    if (!c.url || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
    await db.prepare("INSERT OR REPLACE INTO cctv_cameras (id,name,road,lat,lon,stream_url,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7)")
      .bind(c.id || c.name, c.name, c.road ?? "국도", c.lat, c.lon, c.url, now).run();
    n++;
  }
  return n;
}
