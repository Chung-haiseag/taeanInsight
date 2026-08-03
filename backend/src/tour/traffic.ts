// 한국도로공사 실시간 권역 교통량 — 대전충남본부(903) 유입 선행지표.
//   data.ex.co.kr/openapi/trafficapi/trafficRegion (공개키 DATA_EX_KEY, HTTPS). 시간당 집계.
//   출구(고속도로 빠져나옴)=충남 도착 유입 ≈ 관광 선행신호. 태안 단독 IC 실시간은 미제공이라 권역 프록시.
//   방문자 실측(2~6주 지연)의 실시간 보완용. traffic_daily에 일 스냅샷 적재 → 추세/주말 대비.

import type { Env } from "../types";

const BASE = "https://data.ex.co.kr/openapi/trafficapi/trafficRegion";
const REGION_CODE = "903"; // 대전충남본부

interface RawRow {
  regionCode?: string; regionName?: string; inoutName?: string;
  trafficAmout?: string; sumDate?: string; sumTm?: string;
}

export interface RegionTraffic {
  region: string;
  inbound: number;   // 입구(고속도로 진입)
  outbound: number;  // 출구(고속도로 진출=도착 유입)
  sumDate: string | null;
  sumTm: string | null;
}

// ── 순수 함수 ──
export function aggregateRegion(rows: RawRow[], regionCode: string): RegionTraffic | null {
  const sel = rows.filter((r) => r.regionCode === regionCode);
  if (!sel.length) return null;
  let inbound = 0, outbound = 0;
  for (const r of sel) {
    const n = Number(r.trafficAmout);
    const v = Number.isFinite(n) ? n : 0;
    if (r.inoutName === "출구") outbound += v;
    else if (r.inoutName === "입구") inbound += v;
  }
  return {
    region: sel[0].regionName ?? regionCode,
    inbound, outbound,
    sumDate: sel[0].sumDate ?? null,
    sumTm: sel[0].sumTm ?? null,
  };
}

// ── 네트워크 ──
async function fetchAllRegionRows(key: string): Promise<RawRow[]> {
  const rows: RawRow[] = [];
  for (let pageNo = 1; pageNo <= 4; pageNo++) {
    const qs = new URLSearchParams({ key, type: "json", numOfRows: "500", pageNo: String(pageNo) });
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    try {
      const res = await fetch(`${BASE}?${qs}`, { signal: c.signal });
      const j = (await res.json()) as { trafficRegion?: RawRow[] };
      const list = j.trafficRegion ?? [];
      rows.push(...list);
      if (list.length < 500) break;
    } catch {
      break;
    } finally {
      clearTimeout(t);
    }
  }
  return rows;
}

// 대전충남본부 실시간 교통량(최근 집계 시각). 로컬 크롤러 전용(Worker는 data.ex.co.kr 못 닿음). 실패 시 null.
export async function fetchChungnamTraffic(key: string): Promise<RegionTraffic | null> {
  if (!key) return null;
  const rows = await fetchAllRegionRows(key);
  return aggregateRegion(rows, REGION_CODE);
}

// ── D1 미러 (Worker) ──
// 로컬 크롤러가 보낸 권역 교통량을 적재. (base_date, sum_tm) 유니크로 중복 방지.
export async function ingestTraffic(
  db: D1Database,
  t: { region?: string; inbound?: number; outbound?: number; sumDate?: string; sumTm?: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO traffic_daily (base_date, sum_tm, region, inbound, outbound, captured_at)
       VALUES (?1,?2,?3,?4,?5,?6)
       ON CONFLICT(base_date, sum_tm) DO UPDATE SET inbound=excluded.inbound, outbound=excluded.outbound, region=excluded.region, captured_at=excluded.captured_at`,
    )
    .bind(t.sumDate ?? "", t.sumTm ?? "", t.region ?? "대전충남본부", t.inbound ?? 0, t.outbound ?? 0, new Date().toISOString())
    .run();
}

// 최신 적재 교통량(가장 늦은 base_date·sum_tm). 없으면 null.
export async function latestTraffic(env: Env): Promise<RegionTraffic | null> {
  if (!env.ARCHIVE_DB) return null;
  const r = await env.ARCHIVE_DB
    .prepare(`SELECT base_date, sum_tm, region, inbound, outbound FROM traffic_daily ORDER BY base_date DESC, sum_tm DESC LIMIT 1`)
    .first<{ base_date: string; sum_tm: string; region: string; inbound: number; outbound: number }>();
  if (!r) return null;
  return { region: r.region, inbound: r.inbound, outbound: r.outbound, sumDate: r.base_date, sumTm: r.sum_tm };
}
