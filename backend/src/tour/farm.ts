// 영농 경보 — 태안 농업(마늘·생강·감자·고추·양파·고구마) 기상 위험 + 이번 달 농사 적기. 농업 사장님·주민.
//   서리·한파·폭염 경보(단기예보 최저·최고기온) + 파종/수확 적기 큐레이션. 위험/할일 있을 때만 노출. 새 키 불필요.

const KMA_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";

export type FarmAlertKind = "서리" | "한파" | "폭염";
export interface FarmAlert { kind: FarmAlertKind; text: string }

// ── 순수 함수: 기상 경보 ──
export function farmAlerts(d: { minTemp: number | null; maxTemp: number | null; month: number }): FarmAlert[] {
  const a: FarmAlert[] = [];
  // 서리 — 봄(3·4)·가을(10·11) 최저 ≤3℃(냉해)
  if (d.minTemp != null && d.minTemp <= 3 && [3, 4, 10, 11].includes(d.month)) {
    a.push({ kind: "서리", text: `서리 주의(최저 ${d.minTemp}℃) — 농작물 냉해·늦서리 대비` });
  }
  // 한파 — 최저 ≤ -5℃(월동작물·시설)
  if (d.minTemp != null && d.minTemp <= -5) {
    a.push({ kind: "한파", text: `한파(최저 ${d.minTemp}℃) — 월동작물·하우스 보온` });
  }
  // 폭염 — 최고 ≥ 35℃(관수·차광)
  if (d.maxTemp != null && d.maxTemp >= 35) {
    a.push({ kind: "폭염", text: `폭염(최고 ${d.maxTemp}℃) — 관수·차광, 시들음 대비` });
  }
  return a;
}

// ── 순수 함수: 이번 달 농사 적기 ──
export interface FarmTask { crop: string; emoji: string; task: "파종 적기" | "수확 적기" }
const CROPS: Array<{ crop: string; emoji: string; plant: number[]; harvest: number[] }> = [
  { crop: "마늘", emoji: "🧄", plant: [9, 10], harvest: [6] },
  { crop: "양파", emoji: "🧅", plant: [11], harvest: [6] },
  { crop: "감자", emoji: "🥔", plant: [3], harvest: [6] },
  { crop: "고추", emoji: "🌶", plant: [5], harvest: [8, 9] },
  { crop: "생강", emoji: "🫚", plant: [4], harvest: [10, 11] },
  { crop: "고구마", emoji: "🍠", plant: [5], harvest: [9, 10] },
];
export function farmTasks(month: number): FarmTask[] {
  const out: FarmTask[] = [];
  for (const c of CROPS) {
    if (c.plant.includes(month)) out.push({ crop: c.crop, emoji: c.emoji, task: "파종 적기" });
    if (c.harvest.includes(month)) out.push({ crop: c.crop, emoji: c.emoji, task: "수확 적기" });
  }
  return out;
}

// ── 네트워크 ──
import type { Env } from "../types";
import { REGION } from "../region";

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
async function fetchMinMax(key: string): Promise<{ min: number | null; max: number | null }> {
  const base = new Date(Date.now() + 9 * 3600 * 1000);
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = base.getUTCHours();
  const slot = slots.find((s) => h >= s) ?? 2;
  const baseDate = h >= 2 ? ymd(base) : ymd(new Date(base.getTime() - 86_400_000));
  const today = ymd(base);
  try {
    const sp = new URLSearchParams({
      serviceKey: key, dataType: "JSON", numOfRows: "1000", pageNo: "1",
      base_date: baseDate, base_time: String(slot).padStart(2, "0") + "00", nx: REGION.grid.nx, ny: REGION.grid.ny,
    });
    const res = await fetch(`${KMA_BASE}/getVilageFcst?${sp}`, { signal: AbortSignal.timeout(9000) });
    const j = (await res.json()) as { response?: { body?: { items?: { item?: Array<Record<string, string>> } } } };
    const items = (j.response?.body?.items?.item ?? []).filter((it) => it.fcstDate === today);
    const tmn = items.find((it) => it.category === "TMN")?.fcstValue;
    const tmx = items.find((it) => it.category === "TMX")?.fcstValue;
    return { min: tmn != null ? Math.round(Number(tmn)) : null, max: tmx != null ? Math.round(Number(tmx)) : null };
  } catch {
    return { min: null, max: null };
  }
}

export interface FarmBoard { available: boolean; month: number; alerts: FarmAlert[]; tasks: FarmTask[] }

export async function loadFarm(env: Env): Promise<FarmBoard> {
  const month = new Date(Date.now() + 9 * 3600 * 1000).getUTCMonth() + 1;
  const key = env.DATA_GO_KR_KEY_TOUR || env.DATA_GO_KR_KEY;
  const tasks = farmTasks(month);
  if (!key) return { available: tasks.length > 0, month, alerts: [], tasks };
  const mm = await fetchMinMax(key);
  const alerts = farmAlerts({ minTemp: mm.min, maxTemp: mm.max, month });
  return { available: alerts.length > 0 || tasks.length > 0, month, alerts, tasks };
}
