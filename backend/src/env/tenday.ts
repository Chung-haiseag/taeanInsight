// 10일 예보 — 홈 오른쪽 카드. 기상청은 한 번에 열흘을 주지 않는다:
//   단기예보 getVilageFcst (오늘~+3일, 3시간 간격) + 중기예보 getMidLandFcst/getMidTa (+3~+10일)를 이어 붙인다.
//   겹치는 +3일은 단기가 더 정확하므로 단기를 쓴다.
// ⚠ 날짜 계산은 전부 KST 문자열(YYYY-MM-DD)로 한다 — Date 산술은 UTC 경계에서 하루가 밀린다.
import { makeTtlCache } from "../lib/cache";
import { fetchMidForecast, type MidDay } from "./midforecast";
import { parseHours, kstHourKey, type FcstItem, type HourItem } from "./hourly";
import { REGION } from "../region";

const KMA_VILAGE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
const SKY: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
const PTY: Record<string, string> = { "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기" };
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export interface ShortDay { date: string; tmin: number | null; tmax: number | null; pop: number | null; sky: string | null; pty: string | null }
export interface TenDayItem {
  date: string;
  label: string;      // 오늘 / 내일 / 10.12 월
  weekday: string;    // 월~일
  sky: string | null; // 비 오는 날은 하늘 대신 비 종류
  pop: number | null; // 강수확률 %
  tmin: number | null;
  tmax: number | null;
  source: "short" | "mid";
}
// hours: 같은 단기예보 응답에서 뽑은 앞으로 24시간(시간별 예보 그래프용). 외부 호출은 한 번뿐이다.
export interface TenDayForecast { available: boolean; days: TenDayItem[]; hours: HourItem[]; baseDate: string | null }

const num = (v: string | undefined): number | null => {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** YYYYMMDD → YYYY-MM-DD */
const dash = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

/** 단기예보 항목을 날짜별로 접는다. 하루 = 최저·최고기온, 강수확률 최대, 정오 하늘, 비 종류. */
export function parseShortDays(items: FcstItem[]): ShortDay[] {
  const byDate = new Map<string, FcstItem[]>();
  for (const it of items) {
    const list = byDate.get(it.fcstDate);
    if (list) list.push(it); else byDate.set(it.fcstDate, [it]);
  }
  return [...byDate.keys()].sort().map((ymd) => {
    const day = byDate.get(ymd) ?? [];
    const pops = day.filter((it) => it.category === "POP").map((it) => num(it.fcstValue)).filter((n): n is number => n != null);
    // 정오(15시) 하늘을 대표로 — 없으면 그날 첫 SKY
    const sky = day.find((it) => it.category === "SKY" && it.fcstTime === "1500") ?? day.find((it) => it.category === "SKY");
    const pty = day.filter((it) => it.category === "PTY").map((it) => it.fcstValue).find((v) => v && v !== "0");
    return {
      date: dash(ymd),
      tmin: num(day.find((it) => it.category === "TMN")?.fcstValue),
      tmax: num(day.find((it) => it.category === "TMX")?.fcstValue),
      pop: pops.length ? Math.max(...pops) : null,
      sky: sky ? (SKY[sky.fcstValue] ?? null) : null,
      pty: pty ? (PTY[pty] ?? null) : null,
    };
  });
}

/** 오늘/내일/‘10.12 월’. date·today는 YYYY-MM-DD. */
export function dayLabel(date: string, today: string): { label: string; weekday: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = WEEKDAY[d.getUTCDay()];
  const diff = Math.round((d.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
  if (diff === 0) return { label: "오늘", weekday };
  if (diff === 1) return { label: "내일", weekday };
  return { label: `${date.slice(5, 7)}.${date.slice(8, 10)} ${weekday}`, weekday };
}

/** 단기 + 중기를 오늘부터 열흘로. 겹치면 단기, 없는 날은 건너뛴다(채워 넣지 않는다). */
export function mergeTenDays(short: ShortDay[], mid: Record<string, MidDay>, today: string): TenDayItem[] {
  const out = new Map<string, TenDayItem>();
  for (const [date, m] of Object.entries(mid)) {
    if (date < today) continue;
    const { label, weekday } = dayLabel(date, today);
    out.set(date, { date, label, weekday, sky: m.sky, pop: m.pop, tmin: m.tmin, tmax: m.tmax, source: "mid" });
  }
  for (const s of short) {
    if (s.date < today) continue;
    const { label, weekday } = dayLabel(s.date, today);
    // 단기가 이긴다. 다만 **칸 단위로** 이긴다 — 단기예보 끝자락(+4일쯤)은 하늘·강수만 오고 기온이 비는데,
    // 통째로 덮으면 중기가 가진 기온까지 날아간다(2026-10-10 10.14 실제로 빈칸이었다).
    const m = out.get(s.date);
    out.set(s.date, {
      date: s.date, label, weekday,
      // 비가 오는 날은 '구름많음'보다 '비'가 독자에게 쓸모 있다
      sky: s.pty ?? s.sky ?? m?.sky ?? null,
      pop: s.pop ?? m?.pop ?? null,
      tmin: s.tmin ?? m?.tmin ?? null,
      tmax: s.tmax ?? m?.tmax ?? null,
      source: "short",
    });
  }
  return [...out.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 10);
}

/** KST 기준 오늘(YYYY-MM-DD)과 단기예보 base_date/base_time */
function kstToday(now = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}
function vilageBase(now = Date.now()): { baseDate: string; baseTime: string } {
  const k = new Date(now + 9 * 3600_000);
  const h = k.getUTCHours();
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const slot = slots.find((s) => h >= s);
  // 02시 발표 전이면 어제 23시 발표분
  const d = slot == null ? new Date(k.getTime() - 86_400_000) : k;
  return { baseDate: d.toISOString().slice(0, 10).replace(/-/g, ""), baseTime: `${String(slot ?? 23).padStart(2, "0")}00` };
}

/** 단기예보 원자료. 날짜별(10일)과 시각별(24시간) 둘 다 여기서 나온다. */
async function fetchVilage(key: string, nx: string, ny: string): Promise<FcstItem[]> {
  try {
    const { baseDate, baseTime } = vilageBase();
    // numOfRows 1000은 약 3일치 — 10일 예보의 앞 사흘과 24시간 그래프 모두 넉넉하다.
    const sp = new URLSearchParams({ serviceKey: key, dataType: "JSON", numOfRows: "1000", pageNo: "1", base_date: baseDate, base_time: baseTime, nx, ny });
    const res = await fetch(`${KMA_VILAGE}?${sp}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) { console.warn(`[tenday] 단기예보 ${res.status}`); return []; }
    const j = (await res.json()) as { response?: { body?: { items?: { item?: FcstItem[] } } } };
    return j.response?.body?.items?.item ?? [];
  } catch (e) {
    console.warn("[tenday] 단기예보 실패:", e instanceof Error ? e.message.slice(0, 120) : e);
    return [];
  }
}

async function loadImpl(env: { DATA_GO_KR_KEY?: string; TAEAN_NX?: string; TAEAN_NY?: string }): Promise<TenDayForecast> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) return { available: false, days: [], hours: [], baseDate: null };
  const today = kstToday();
  const [items, mid] = await Promise.all([
    fetchVilage(key, env.TAEAN_NX ?? REGION.grid.nx, env.TAEAN_NY ?? REGION.grid.ny),
    fetchMidForecast(env).catch(() => ({ available: false, days: {}, baseDate: null })),
  ]);
  const days = mergeTenDays(parseShortDays(items), mid.days, today);
  const hours = parseHours(items, kstHourKey());
  return { available: days.length > 0 || hours.length > 0, days, hours, baseDate: today };
}

// 30분 캐시 — 단기예보는 3시간마다, 중기는 하루 2회 갱신이라 이 이상 자주 부를 이유가 없다.
export const loadTenDay = makeTtlCache(loadImpl, 30 * 60_000);
