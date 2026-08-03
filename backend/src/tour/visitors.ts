// 태안 관광 방문자 실측 — 한국관광공사 빅데이터 '지역별 방문자수'(data.go.kr 15101972).
//   관광 수요지수의 '정답(ground truth)'. 관광객 = 외지인(touDivCd=2) + 외국인(3), 현지인(1) 제외.
//   API는 지역 필터 파라미터가 없어 전체 시군구를 받아 태안(44825)만 로컬 필터한다. HTTPS 전용.
//   갱신: 매월 17일 전월분(2~6주 지연) → '이번 주말' 입력보다 백테스트 정답·가중치 보정에 쓴다.
//   흐름: ingestRecentVisitors(cron 수집) → tour_visitors 적재 → resolveVisitActuals(주말 실측 채움).

import type { Env } from "../types";

const BASE = "https://apis.data.go.kr/B551011/DataLabService";
export const TAEAN_SIGNGU = "44825";

// 방문자수 API는 공휴일·날씨와 등록 키가 다를 수 있어 전용 키 우선(없으면 폴백).
const tourKey = (env: Env) => env.DATA_GO_KR_KEY_TOUR || env.DATA_GO_KR_KEY;

export interface VisitorRow {
  baseYmd: string;        // "20260606"
  signguCode: string;     // "44825"
  touDivCd: string;       // 1=현지인, 2=외지인, 3=외국인
  touNum: number;         // 방문자수
  daywkCd: string | null; // 1=월..7=일
}

// ── 순수 함수 (파싱·정답 계산) ─────────────────────────────────────────────

// API 응답(JSON) → 방문자 행 배열. response.body.items.item(배열/단일), touNum 문자열 처리.
export function parseVisitorItems(json: unknown): VisitorRow[] {
  const body = (json as any)?.response?.body;
  const raw = body?.items?.item;
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: VisitorRow[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const num = Number(it.touNum);
    if (!it.baseYmd || !it.signguCode || !it.touDivCd || Number.isNaN(num)) continue;
    out.push({
      baseYmd: String(it.baseYmd),
      signguCode: String(it.signguCode),
      touDivCd: String(it.touDivCd),
      touNum: num,
      daywkCd: it.daywkDivCd != null ? String(it.daywkDivCd) : null,
    });
  }
  return out;
}

export function filterSigngu(rows: VisitorRow[], code: string): VisitorRow[] {
  return rows.filter((r) => r.signguCode === code);
}

// 날짜별 '외부 방문객(외지인+외국인)' 합계 맵 — 현지인(1) 제외.
export function outsideByYmd(rows: VisitorRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.touDivCd !== "2" && r.touDivCd !== "3") continue;
    m.set(r.baseYmd, (m.get(r.baseYmd) ?? 0) + r.touNum);
  }
  return m;
}

const ymdOf = (isoDate: string) => isoDate.replace(/-/g, "");
function addDayIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

// 주말 실측(정답) = 토+일 관광객 합. 둘 다 있어야 반환, 하나라도 없으면(미갱신) null.
export function weekendActual(satIso: string, outside: Map<string, number>): number | null {
  const sat = outside.get(ymdOf(satIso));
  const sun = outside.get(ymdOf(addDayIso(satIso)));
  if (sat == null || sun == null) return null;
  return Math.round(sat + sun);
}

// ── 네트워크·D1 (수집·적재·정답 채움) ───────────────────────────────────────

async function fetchPage(key: string, startYmd: string, endYmd: string, pageNo: number, numOfRows: number): Promise<unknown> {
  const qs = new URLSearchParams({
    serviceKey: key, numOfRows: String(numOfRows), pageNo: String(pageNo),
    MobileOS: "ETC", MobileApp: "TaeanInsight", _type: "json", startYmd, endYmd,
  });
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try {
    const res = await fetch(`${BASE}/locgoRegnVisitrDDList?${qs}`, { signal: c.signal });
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// 기간 내 태안 방문자 행 전체 — 전 시군구를 페이지네이션하며 44825만 수집.
export async function fetchTaeanVisitors(env: Env, startYmd: string, endYmd: string): Promise<VisitorRow[]> {
  const key = tourKey(env);
  if (!key) return [];
  const NUM = 1000;
  const collected: VisitorRow[] = [];
  let pageNo = 1;
  let totalCount = Infinity;
  const MAX_PAGES = 120; // 안전장치(≈120일 분량)
  while (pageNo <= MAX_PAGES) {
    let json: unknown;
    try {
      json = await fetchPage(key, startYmd, endYmd, pageNo, NUM);
    } catch {
      break; // 일시 오류 시 지금까지 수집분으로 진행(단일 실패가 전체를 죽이지 않게)
    }
    const rows = parseVisitorItems(json);
    if (!rows.length) break;
    collected.push(...filterSigngu(rows, TAEAN_SIGNGU));
    const tc = Number((json as any)?.response?.body?.totalCount);
    if (Number.isFinite(tc)) totalCount = tc;
    if (pageNo * NUM >= totalCount) break;
    pageNo++;
  }
  return collected;
}

const kstYmd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

// 최근 방문자 수집 — 이미 적재된 최신일 다음날부터 오늘까지(최초엔 최근 ~50일). cron에서 호출.
export async function ingestRecentVisitors(env: Env): Promise<{ upserted: number; from: string; to: string }> {
  if (!env.ARCHIVE_DB || !tourKey(env)) return { upserted: 0, from: "", to: "" };
  const now = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const to = kstYmd(now);
  const last = await env.ARCHIVE_DB
    .prepare(`SELECT MAX(base_ymd) AS m FROM tour_visitors WHERE signgu_code = ?`)
    .bind(TAEAN_SIGNGU)
    .first<{ m: string | null }>();
  let from: string;
  if (last?.m) {
    // 이미 있는 최신일 다음날 (지연갱신 보정 위해 최소 10일은 다시 확인)
    const y = Number(last.m.slice(0, 4)), mo = Number(last.m.slice(4, 6)), d = Number(last.m.slice(6, 8));
    const start = new Date(Date.UTC(y, mo - 1, d - 10)); // 최근 10일 재확인(값 정정 대비)
    from = kstYmd(start);
  } else {
    const start = new Date(now.getTime() - 50 * 86_400_000);
    from = kstYmd(start);
  }
  if (from > to) return { upserted: 0, from, to };
  const rows = await fetchTaeanVisitors(env, from, to);
  const stamp = new Date().toISOString();
  let upserted = 0;
  for (const r of rows) {
    await env.ARCHIVE_DB
      .prepare(
        `INSERT INTO tour_visitors (base_ymd, signgu_code, tou_div_cd, tou_num, daywk_cd, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(base_ymd, signgu_code, tou_div_cd)
         DO UPDATE SET tou_num = excluded.tou_num, daywk_cd = excluded.daywk_cd, updated_at = excluded.updated_at`,
      )
      .bind(r.baseYmd, r.signguCode, r.touDivCd, r.touNum, r.daywkCd, stamp)
      .run();
    upserted++;
  }
  return { upserted, from, to };
}

// 주말 실측 채움 — tour_demand_log.actual_visit이 비고 토·일 방문자 데이터가 모두 있는 주말에 채운다.
export async function resolveVisitActuals(env: Env): Promise<{ filled: number }> {
  if (!env.ARCHIVE_DB) return { filled: 0 };
  const wk = await env.ARCHIVE_DB
    .prepare(`SELECT DISTINCT weekend_sat FROM tour_demand_log WHERE actual_visit IS NULL`)
    .all<{ weekend_sat: string }>();
  const weekends = (wk.results ?? []).map((r) => r.weekend_sat);
  if (!weekends.length) return { filled: 0 };
  // 태안 외부 방문객(외지인+외국인) 일별 맵 로드
  const vr = await env.ARCHIVE_DB
    .prepare(`SELECT base_ymd, tou_div_cd, tou_num FROM tour_visitors WHERE signgu_code = ? AND tou_div_cd IN ('2','3')`)
    .bind(TAEAN_SIGNGU)
    .all<{ base_ymd: string; tou_div_cd: string; tou_num: number }>();
  const outside = new Map<string, number>();
  for (const r of vr.results ?? []) outside.set(r.base_ymd, (outside.get(r.base_ymd) ?? 0) + Number(r.tou_num));
  let filled = 0;
  for (const sat of weekends) {
    const actual = weekendActual(sat, outside);
    if (actual == null) continue;
    await env.ARCHIVE_DB
      .prepare(`UPDATE tour_demand_log SET actual_visit = ?2 WHERE weekend_sat = ?1 AND actual_visit IS NULL`)
      .bind(sat, actual)
      .run();
    filled++;
  }
  return { filled };
}
