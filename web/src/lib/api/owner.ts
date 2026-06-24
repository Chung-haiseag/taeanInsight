// 사장님 초개인화 OwnerHome API — 브리프 조회 + 가게 프로필 설정.
import { apiFetch, ApiError } from "./client";
import type { DemandForecast, TideInfo } from "./reports";

export type ShopIndustry = "lodging" | "food" | "cafe" | "leisure" | "retail" | "other";
export interface ShopProfile { industry: ShopIndustry; eupMyeon?: string; capacity?: number; name?: string; basePrice?: number; weekendPrice?: number }
export interface OwnerAction { icon: string; text: string; why: string; tag?: string; priority?: number }
export interface OwnerLive { pm10: number | null; pm25: number | null; grade: string | null; temp: number | null; humidity: number | null; sky: string | null; observedAt: string | null }
export interface LodgingBoard {
  weekend: { sat: string; sun: string };
  level: string;
  occRate: number;
  priceMultiplier: number;
  basePrice: number | null;
  recommendedPrice: number | null;
  rooms: number | null;
  estRevenue: number | null;
  festivalSoon: { title: string; dday: number } | null;
  weekendRain: boolean;
  notes: string[];
}

export interface OwnerBrief {
  hasShop: boolean;
  industry: ShopIndustry | null;
  demand: DemandForecast | null;
  weather: OwnerLive | null;
  tide: TideInfo | null;
  uv: { todayMax: number | null; level: string; peakHour: string | null } | null;
  actions: OwnerAction[];
  lodging: LodgingBoard | null;
  market: {
    festivals: Array<{ title: string; dday: number }>;
    gasoline: number | null;
    aptAvgManwon: number | null;
    nearbyLodging?: { total: number; nearbyEup: number | null; eupLabel: string | null } | null;
  };
}
export interface NearbyLodging { total: number; nearbyEup: number | null; eupLabel: string | null }

export const INDUSTRY_OPTIONS: { value: ShopIndustry; label: string; emoji: string }[] = [
  { value: "lodging", label: "숙박(펜션·호텔)", emoji: "🛏" },
  { value: "food", label: "음식점", emoji: "🍽" },
  { value: "cafe", label: "카페·베이커리", emoji: "☕" },
  { value: "leisure", label: "레저·체험", emoji: "🏄" },
  { value: "retail", label: "소매·상점", emoji: "🛍" },
  { value: "other", label: "기타", emoji: "🏢" },
];

export function fetchOwnerBrief(): Promise<OwnerBrief> {
  return apiFetch<OwnerBrief>("/api/me/owner-brief");
}

export async function updateShopProfile(shopProfile: ShopProfile): Promise<{ ok: boolean; needOnboarding?: boolean }> {
  try {
    await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify({ shopProfile }) });
    return { ok: true };
  } catch (e) {
    // 온보딩 전이면 선호도가 없어 404 — 안내용 플래그
    if (e instanceof ApiError && e.status === 404) return { ok: false, needOnboarding: true };
    throw e;
  }
}
