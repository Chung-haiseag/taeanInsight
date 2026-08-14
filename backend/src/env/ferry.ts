// 여객선 운항상태 — 안흥(신진도) ↔ 가의도. 태안 유일의 여객선 항로이자 가의도 주민·방문객의 생명선.
//   출처: 한국해양교통안전공단(data.go.kr 15142304) https://apis.data.go.kr/B554035/ferry-route-info-v4
//   API에 항로/항구 필터 파라미터가 없어 '운항일자(rlvtYmd)'로 전국을 받아 항로명으로 걸러낸다.
//
//   ⚠ 호출 예산: 개발계정 일 100건. 전국 1일 운항이 5,122행(6페이지)이라 '요청 때마다 호출'은 불가.
//     → ①취항선명(psnshpNm) 서버측 필터로 6페이지 → 1페이지 ②D1 캐시 30분 + stale-while-revalidate
//     ③30분 크론에서 선워밍(index.ts). 갱신 1회당 1건이라 48건/일로 한도의 절반 이하.

import { readCache, writeCache } from "../lib/api_cache";

// 서비스 URL 뒤에 상세기능(오퍼레이션) 경로가 한 번 더 붙는 형태. 빼면 NO_OPENAPI_SERVICE_ERROR(코드 12).
const URL_BASE = "https://apis.data.go.kr/B554035/ferry-route-info-v4/get-ferry-route-info-v4";
// 캐시 키에 스키마 버전(v2)을 붙인다 — 결과 구조가 바뀌면 키를 올려 옛 캐시를 즉시 무효화한다.
//   (v1 시절 필드명을 잘못 읽어 빈 값이 채워진 결과가 30분간 그대로 서빙된 적이 있다. v3=updatedAt 추가.)
const CACHE_KEY = "ferry_gauido_v3";
const STALE_MS = 30 * 60_000; // 30분 — 취항선명 필터로 갱신 1회 호출이라 여유(최악 48건/일 < 100건 한도)
const PAGE = 1000;
const MAX_PAGES = 6; // 전국 1일 운항 5,122행(2026-08-14 실측) → 6,000행까지 커버.

// 항로명·항구명에 이 중 하나가 들어가면 태안 항로로 본다.
//   실제 데이터의 항로명이 약어라("안흥-가의") 표기 흔들림에 대비해 넓게 잡는다.
const ROUTE_TERMS = ["가의", "안흥", "태안", "신진"];

// 안흥↔가의도 취항선(2026-08-14 실측). 서버측 psnshpNm 필터로 쓰면 전국 6페이지 → 1페이지로 줄어
//   개발계정 일 100건 한도가 넉넉해진다. 배가 바뀌면 필터가 비고, 그때 전국 스캔으로 자동 폴백한다.
const SHIP_NAME = "해랑5호";

export interface FerrySailing {
  time: string;        // 출항시각 "08:30"
  ship: string;        // 여객선명
  route: string;       // 운항항로명
  status: string;      // 운항상태(정상운항/운항통제/비운항 등)
  normal: boolean;     // 정상 출항 여부
  reason?: string;     // 결항·통제 사유
}
export interface FerryResult {
  available: boolean;
  date: string;              // YYYY-MM-DD
  route: string;             // 대표 항로명
  sailings: FerrySailing[];
  allNormal: boolean;        // 전편 정상
  updatedAt: string;         // 이 결과를 만든 시각(ISO). 화면 '기준 시각' + 갱신이 도는지 확인용.
  note?: string;
}

interface Row { [k: string]: unknown }

const s = (v: unknown): string => (v == null ? "" : String(v).trim());

// 운항상태 → 정상 여부. 이 판정 하나에 화면 강조와 기자 결항 알림이 전부 달려 있다.
//   실측 상태값(2026-08-14): 완료·출항중·운항중. 결항 계열은 아직 관측되지 않아 화이트리스트가 아닌
//   '이상 신호 블랙리스트'로 둔다 — 새 정상 상태값이 생겨도 오탐(가짜 결항 알림)이 나지 않게.
export const isNormalStatus = (status: string): boolean => !/결항|통제|중단|취소|欠航/.test(status);

// "830" / "0830" / "08:30" → "08:30"
function fmtTime(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 3) return `0${d[0]}:${d.slice(1)}`;
  if (d.length === 4) return `${d.slice(0, 2)}:${d.slice(2)}`;
  return raw;
}

function kstDate(): { ymd: string; iso: string } {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, "0"), day = String(d.getUTCDate()).padStart(2, "0");
  return { ymd: `${y}${m}${day}`, iso: `${y}-${m}-${day}` };
}

async function fetchPage(key: string, ymd: string, p: number, ship?: string): Promise<{ rows: Row[]; total: number | null }> {
  const sp = new URLSearchParams({ serviceKey: key, pageNo: String(p), numOfRows: String(PAGE), dataType: "JSON", rlvtYmd: ymd });
  if (ship) sp.set("psnshpNm", ship);
  const res = await fetch(`${URL_BASE}?${sp}`, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) return { rows: [], total: null };
  let j: Record<string, unknown>;
  try { j = (await res.json()) as Record<string, unknown>; } catch { return { rows: [], total: null }; }
  // 공공데이터포털 응답 껍데기가 기관마다 달라(response.body.items / body.items / items) 모두 대응.
  const body = ((j.response as Record<string, unknown>)?.body ?? j.body ?? j) as Record<string, unknown>;
  const rawItems = (body?.items as Record<string, unknown>)?.item ?? body?.items ?? body?.item;
  const rows: Row[] = Array.isArray(rawItems) ? (rawItems as Row[]) : rawItems ? [rawItems as Row] : [];
  const t = Number(body?.totalCount);
  return { rows, total: Number.isFinite(t) ? t : null };
}

// 태안 항로 행만 골라낸다. 항로명이 약어("안흥-가의")라 특정 키만 보지 않고 행 전체 문자열을 훑는다.
const isTaeanRow = (r: Row) => {
  const hay = Object.values(r).map((v) => s(v)).join(" ");
  return ROUTE_TERMS.some((t) => hay.includes(t));
};

async function fetchFerryImpl(env: { DATA_GO_KR_KEY?: string }): Promise<FerryResult> {
  const { ymd, iso } = kstDate();
  const empty: FerryResult = { available: false, date: iso, route: "안흥 ↔ 가의도", sailings: [], allNormal: true, updatedAt: new Date().toISOString() };
  const key = env.DATA_GO_KR_KEY;
  if (!key) return empty;
  try {
    // 1차: 취항선명으로 서버측 필터(1회 호출). 배가 바뀌면 비므로 2차 전국 스캔으로 폴백.
    let mine = (await fetchPage(key, ymd, 1, SHIP_NAME)).rows.filter(isTaeanRow);
    if (!mine.length) {
      const first = await fetchPage(key, ymd, 1);
      const rows: Row[] = [...first.rows];
      const need = first.total != null ? Math.ceil(first.total / PAGE) : (first.rows.length >= PAGE ? MAX_PAGES : 1);
      const lastPage = Math.min(need, MAX_PAGES);
      if (lastPage > 1) {
        const rest = await Promise.all(
          Array.from({ length: lastPage - 1 }, (_, i) => fetchPage(key, ymd, i + 2).catch(() => ({ rows: [] as Row[], total: null }))),
        );
        for (const r of rest) rows.push(...r.rows);
      }
      mine = rows.filter(isTaeanRow);
    }
    if (!mine.length) return { ...empty, note: "오늘 등록된 안흥↔가의도 운항 정보가 없습니다." };

    // 편(출항시각 × 방향)마다 상태 변경 이력이 여러 행으로 쌓인다 → 편별 '가장 최근 상태'만 남긴다.
    const byTrip = new Map<string, Row>();
    for (const r of mine) {
      const tripKey = `${s(r.sail_tm)}|${s(r.nvg_drc_cd) || s(r.nvg_drc_nm)}`;
      const prev = byTrip.get(tripKey);
      if (!prev || s(r.nvg_stts_chg_dt) > s(prev.nvg_stts_chg_dt)) byTrip.set(tripKey, r);
    }

    const sailings: FerrySailing[] = [...byTrip.values()]
      .map((r) => {
        const status = s(r.nvg_stts_nm) || "정보없음";
        // 정방향=안흥→가의도, 역방향=가의도→안흥. '정방향' 같은 용어는 독자에게 안 보이게 풀어 쓴다.
        const forward = !s(r.nvg_drc_nm).includes("역");
        return {
          time: fmtTime(s(r.sail_tm)),
          ship: s(r.psnshp_nm),
          route: forward ? "안흥 → 가의도" : "가의도 → 안흥",
          status,
          normal: isNormalStatus(status),
          reason: s(r.nvg_stts_rsn) || undefined,
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time) || a.route.localeCompare(b.route));

    return {
      available: true,
      date: iso,
      route: "안흥(신진도) ↔ 가의도",
      sailings,
      allNormal: sailings.every((x) => x.normal),
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return empty;
  }
}

// D1 캐시 + stale-while-revalidate(해무와 동일 패턴) — 호출 한도 보호의 핵심.
export async function loadFerryFast(
  env: { DATA_GO_KR_KEY?: string; ARCHIVE_DB?: D1Database },
): Promise<{ result: FerryResult; stale: boolean }> {
  if (env.ARCHIVE_DB) {
    const cached = await readCache<FerryResult>(env.ARCHIVE_DB, CACHE_KEY);
    // 날짜가 바뀌었으면 무조건 갱신(어제 운항표를 오늘로 보여주면 안 된다).
    if (cached && cached.value.available && cached.value.date === kstDate().iso) {
      return { result: cached.value, stale: cached.ageMs > STALE_MS };
    }
  }
  return { result: await refreshFerryCache(env), stale: false };
}

export async function refreshFerryCache(env: { DATA_GO_KR_KEY?: string; ARCHIVE_DB?: D1Database }): Promise<FerryResult> {
  const r = await fetchFerryImpl(env);
  if (env.ARCHIVE_DB && r.available) await writeCache(env.ARCHIVE_DB, CACHE_KEY, r);
  return r;
}
