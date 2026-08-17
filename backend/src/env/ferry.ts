// 여객선 운항상태 — 안흥(신진도) ↔ 가의도. 태안 유일의 여객선 항로이자 가의도 주민·방문객의 생명선.
//   출처: 한국해양교통안전공단(data.go.kr 15142304) https://apis.data.go.kr/B554035/ferry-route-info-v4
//   API에 항로/항구 필터 파라미터가 없어 '운항일자(rlvtYmd)'로 전국을 받아 항로명으로 걸러낸다.
//
//   ⚠ 호출 예산: 개발계정 일 100건. 전국 1일 운항이 5,122행(6페이지)이라 '요청 때마다 호출'은 불가.
//     → ①**첫 배 출항 전에는 아예 호출하지 않는다** — 이 API는 운항이 실제로 일어난 뒤에야 행을 만든다
//        (실측 2026-08-17: 07:48 0행 → 10:33 2행, 첫 배 08:30). 그 전엔 조회해봐야 빈 결과라 낭비다.
//       ②취항선명(psnshpNm) 서버측 필터로 6페이지 → 1페이지 ③D1 캐시 30분 + stale-while-revalidate
//       ④30분 크론 선워밍(index.ts) ⑤**빈 결과도 캐시에 기록**(안 하면 캐시 미스가 반복돼 매 요청이 API행)
//       ⑥전국 스캔 폴백은 **하루 1회로 제한**하고, 성공 시 실제 취항선명을 학습해 다음부터 1페이지로 돌아온다.
//     실측 기준 하루 약 37건(08:30 이후 31틱 × 1 + 스캔 1회 6건)으로 한도의 40% 미만.
//     ※ 이전 구현은 빈 결과를 캐시하지 않고 매번 폴백(6페이지)까지 돌아 오전에만 119건을 쓸 수 있었다.

import { readCache, writeCache } from "../lib/api_cache";

// 서비스 URL 뒤에 상세기능(오퍼레이션) 경로가 한 번 더 붙는 형태. 빼면 NO_OPENAPI_SERVICE_ERROR(코드 12).
const URL_BASE = "https://apis.data.go.kr/B554035/ferry-route-info-v4/get-ferry-route-info-v4";
// 캐시 키에 스키마 버전(v2)을 붙인다 — 결과 구조가 바뀌면 키를 올려 옛 캐시를 즉시 무효화한다.
//   (v1 시절 필드명을 잘못 읽어 빈 값이 채워진 결과가 30분간 그대로 서빙된 적이 있다. v3=updatedAt, v4=scannedAt·shipFilter, v5=normal→state 3상태·allNormal 제거.)
const CACHE_KEY = "ferry_gauido_v5";
const STALE_MS = 30 * 60_000; // 30분 — 취항선명 필터로 갱신 1회 호출이라 여유(최악 48건/일 < 100건 한도)
const PAGE = 1000;
const MAX_PAGES = 6; // 전국 1일 운항 5,122행(2026-08-14 실측) → 6,000행까지 커버.

// 항로명·항구명에 이 중 하나가 들어가면 태안 항로로 본다.
//   실제 데이터의 항로명이 약어라("안흥-가의") 표기 흔들림에 대비해 넓게 잡는다.
const ROUTE_TERMS = ["가의", "안흥", "태안", "신진"];

// 안흥↔가의도 취항선(2026-08-14 실측). 서버측 psnshpNm 필터로 쓰면 전국 6페이지 → 1페이지로 줄어
//   개발계정 일 100건 한도가 넉넉해진다. 배가 바뀌면 필터가 비고, 그때 전국 스캔으로 자동 폴백한다.
const SHIP_NAME = "해랑5호";

// 정기 시간표(태안군청 공식) — 운항상태 API는 '오늘 실제로 뜬 편'만 주므로, 밤·이른 아침이나 결항일에
//   화면이 텅 비거나 '전부 완료'만 남는다. 섬에 가려는 사람이 실제로 원하는 건 '다음 배가 언제인가'라서
//   시간표를 상시 제공한다. 군청 표의 '도착시간'은 API 실측 결과 가의도에서 되돌아 나오는 출항시각이었다
//   (2026-08-14: 09:05·14:05·17:35가 모두 '가의도 → 안흥' 편) → 나가는 배/들어오는 배로 나눠 표기.
const SCHEDULE = {
  하계: { months: [4, 5, 6, 7, 8, 9], out: ["08:30", "13:30", "17:00"], back: ["09:05", "14:05", "17:35"] },
  동계: { months: [10, 11, 12, 1, 2, 3], out: ["08:30", "13:30", "16:30"], back: ["09:05", "14:05", "17:05"] },
} as const;
const OPERATOR = { name: "신한해운", phone: "041-934-8772" };
const DISTANCE_KM = 8;

export type FerrySeason = "하계" | "동계";
export const seasonOf = (month: number): FerrySeason => (SCHEDULE.하계.months as readonly number[]).includes(month) ? "하계" : "동계";

// 지금(KST) 기준 다음 '안흥 출발' 편. 오늘 남은 편이 없으면 내일 첫 배.
//   ※ 카운트다운(N분 뒤)은 두지 않는다 — 페이지가 ISR 캐시라 분 단위 표기는 어긋날 수 있다.
export function nextDeparture(nowHm: string, month: number): { when: "오늘" | "내일"; time: string } {
  const season = seasonOf(month);
  const today = SCHEDULE[season].out;
  const upcoming = today.find((t) => t > nowHm);
  if (upcoming) return { when: "오늘", time: upcoming };
  // 내일이 계절 경계를 넘을 수도 있으나(월말) 첫 배는 두 계절 모두 08:30이라 영향 없음.
  return { when: "내일", time: today[0] };
}

export interface FerrySailing {
  time: string;        // 출항시각 "08:30"
  ship: string;        // 여객선명
  route: string;       // 운항항로명
  status: string;      // 운항상태 원문(완료/출항중/운항중/결항 등) — 출처 값을 그대로 보여준다
  state: SailState;    // 위 원문을 정상/결항/모름으로 분류한 것
  reason?: string;     // 결항·통제 사유
}
export interface FerryResult {
  available: boolean;
  date: string;              // YYYY-MM-DD
  route: string;             // 대표 항로명
  sailings: FerrySailing[];
  season: FerrySeason;       // 하계(4~9월)/동계(10~3월)
  timetable: { out: string[]; back: string[] };  // 정기 시간표(안흥 출발 / 가의도 출발)
  next: { when: "오늘" | "내일"; time: string }; // 다음 안흥 출발
  operator: { name: string; phone: string };
  distanceKm: number;
  updatedAt: string;         // 이 결과를 만든 시각(ISO). 화면 '기준 시각' + 갱신이 도는지 확인용.
  scannedAt?: string;        // 전국 스캔을 마지막으로 돌린 시각 — 하루 1회 제한용(내부).
  shipFilter?: string;       // psnshpNm에 쓸 취항선명. 스캔으로 학습해 배가 바뀌어도 자가 복구(내부).
  note?: string;
}

interface Row { [k: string]: unknown }

const s = (v: unknown): string => (v == null ? "" : String(v).trim());

// 운항상태 3상태 분류. 이 판정 하나에 화면 강조와 기자 결항 알림이 걸려 있다.
//   이전엔 이진(normal/아님)이라 모르는 문구를 전부 '정상'으로 단정했다 — 결항인데 우리가 모르는
//   표기면 독자에게 '정상'이라 거짓말하는 셈이었다. 그래서 '모름'을 별도 상태로 분리한다.
//   · disrupted: 결항 계열(확실히 잡는다) → 붉게 강조 + 기자 알림
//   · normal   : 실측·예상 가능한 정상 어휘만 인정(2026-08-14 실측: 완료·출항중·운항중)
//   · unknown  : 둘 다 아님 → 독자에겐 '정상'이라 하지 않고, 기자 알림도 보내지 않는다(오탐 방지 유지)
export type SailState = "normal" | "disrupted" | "unknown";
const DISRUPTED_RE = /결항|통제|중단|취소|欠航/;   // '운항통제'·'운항중단'도 여기서 먼저 걸린다
const NORMAL_RE = /완료|출항|운항|입항|접안|정상|예정|대기/;
export function classifyStatus(status: string): SailState {
  if (DISRUPTED_RE.test(status)) return "disrupted";
  if (NORMAL_RE.test(status)) return "normal";
  return "unknown";
}

// "830" / "0830" / "08:30" → "08:30"
function fmtTime(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 3) return `0${d[0]}:${d.slice(1)}`;
  if (d.length === 4) return `${d.slice(0, 2)}:${d.slice(2)}`;
  return raw;
}

function kstDate(): { ymd: string; iso: string; month: number; hm: string } {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, m = String(mo).padStart(2, "0"), day = String(d.getUTCDate()).padStart(2, "0");
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return { ymd: `${y}${m}${day}`, iso: `${y}-${m}-${day}`, month: mo, hm };
}

// 시간표·운항사 등 '항상 제공해야 하는' 정보. 운항상태 API가 비어도(밤·장애·결항일) 이건 나온다.
function scheduleBase(month: number, hm: string) {
  const season = seasonOf(month);
  return {
    season,
    timetable: { out: [...SCHEDULE[season].out], back: [...SCHEDULE[season].back] },
    next: nextDeparture(hm, month),
    operator: OPERATOR,
    distanceKm: DISTANCE_KM,
  };
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

// 오늘 첫 배가 아직 안 떴으면 API에 행이 있을 수 없다 → 호출하지 않는다(호출 예산의 핵심).
export const beforeFirstDeparture = (hm: string, month: number): boolean => hm < SCHEDULE[seasonOf(month)].out[0];

async function fetchFerryImpl(
  env: { DATA_GO_KR_KEY?: string },
  opts: { allowScan: boolean; prevScannedAt?: string; ship?: string } = { allowScan: true },
): Promise<FerryResult> {
  const { ymd, iso, month, hm } = kstDate();
  const base = { available: false, date: iso, route: "안흥(신진도) ↔ 가의도", sailings: [], ...scheduleBase(month, hm) };
  const carry = { scannedAt: opts.prevScannedAt, shipFilter: opts.ship ?? SHIP_NAME };
  const empty: FerryResult = { ...base, ...carry, updatedAt: new Date().toISOString() };
  const key = env.DATA_GO_KR_KEY;
  if (!key) return empty;
  // 첫 배 출항 전 — 조회 없이 시간표만. 이 구간을 막지 않으면 매일 오전 8시간 반 동안 헛호출이 쌓인다.
  if (beforeFirstDeparture(hm, month)) return { ...empty, note: "오늘 첫 배 출항 전입니다. 아래 시간표를 참고하세요." };
  try {
    let scannedAt = opts.prevScannedAt;
    let shipFilter = opts.ship ?? SHIP_NAME;
    // 1차: 취항선명으로 서버측 필터(1회 호출).
    let mine = (await fetchPage(key, ymd, 1, shipFilter)).rows.filter(isTaeanRow);
    // 2차: 비었을 때만 전국 스캔(6페이지). 배가 바뀐 경우를 위한 것이라 하루 1회로 묶는다.
    if (!mine.length && opts.allowScan) {
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
      scannedAt = new Date().toISOString();
      // 스캔으로 실제 취항선명을 학습 → 다음 갱신부터 다시 1페이지로. 배가 바뀌어도 자가 복구된다.
      const learned = s(mine[0]?.psnshp_nm);
      if (learned) shipFilter = learned;
    }
    if (!mine.length) return { ...empty, scannedAt, shipFilter, note: "오늘 등록된 안흥↔가의도 운항 정보가 없습니다." };

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
          state: classifyStatus(status),
          reason: s(r.nvg_stts_rsn) || undefined,
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time) || a.route.localeCompare(b.route));

    return {
      available: true,
      date: iso,
      route: "안흥(신진도) ↔ 가의도",
      sailings,
      ...scheduleBase(month, hm),
      scannedAt,
      shipFilter,
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
    //   ※ available 여부는 보지 않는다 — 빈 결과(첫 배 전·운항 없음)도 유효한 오늘의 답이고,
    //     이걸 캐시로 인정하지 않으면 매 요청이 API 조회로 새어나간다(예산 소진의 원인이었다).
    if (cached && cached.value.date === kstDate().iso) {
      return { result: cached.value, stale: cached.ageMs > STALE_MS };
    }
  }
  return { result: await refreshFerryCache(env), stale: false };
}

export async function refreshFerryCache(env: { DATA_GO_KR_KEY?: string; ARCHIVE_DB?: D1Database }): Promise<FerryResult> {
  // 직전 캐시에서 '오늘 이미 스캔했는지'와 '학습한 취항선명'을 이어받는다.
  const prev = env.ARCHIVE_DB ? await readCache<FerryResult>(env.ARCHIVE_DB, CACHE_KEY) : null;
  const sameDay = !!prev && prev.value.date === kstDate().iso;
  const r = await fetchFerryImpl(env, {
    allowScan: !(sameDay && !!prev.value.scannedAt), // 전국 스캔은 하루 1회
    prevScannedAt: sameDay ? prev.value.scannedAt : undefined,
    ship: sameDay ? prev.value.shipFilter : undefined,
  });
  // 빈 결과도 기록한다(위 주석 참조). 기록하지 않으면 캐시가 영원히 비어 매 요청이 API로 간다.
  if (env.ARCHIVE_DB) await writeCache(env.ARCHIVE_DB, CACHE_KEY, r);
  return r;
}
