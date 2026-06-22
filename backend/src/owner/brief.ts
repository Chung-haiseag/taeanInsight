// 사장님 초개인화 브리프 — OwnerHome 실데이터. 메트릭 스냅샷 재사용(외부 API 추가 호출 없음).
//   주말 수요(forecastDemand)·날씨·물때·자외선 + 업종별 실행 제안(규칙엔진) + 상권 스냅샷.

import type { Env } from "../types";
import type { ShopIndustry, UserPreferences } from "../preferences/types";
import { getFreshSnapshot } from "../reports/metrics_cache";
import { loadReportMetrics, type ReportMetrics } from "../reports/metrics";

export interface OwnerAction { icon: string; text: string; why: string }
export interface OwnerBrief {
  hasShop: boolean;
  industry: ShopIndustry | null;
  demand: ReportMetrics["tourism"]["demand"];
  weather: ReportMetrics["environment"]["live"];
  tide: NonNullable<ReportMetrics["tourism"]["marine"]>["tide"] | null;
  uv: ReportMetrics["uv"];
  actions: OwnerAction[];
  market: {
    festivals: Array<{ title: string; dday: number }>;
    gasoline: number | null;
    aptAvgManwon: number | null;
  };
}

const INDUSTRY_LABEL: Record<ShopIndustry, string> = {
  lodging: "숙박", food: "음식", cafe: "카페", leisure: "레저·체험", retail: "소매", other: "기타",
};

function ymd8ToDday(s: string): number {
  if (!/^\d{8}$/.test(s)) return 999;
  const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
  const target = Date.UTC(y, m - 1, d);
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const today = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
  return Math.round((target - today) / 86400000);
}

// 업종 × 수요등급 × 날씨 × 물때 × 자외선 → 실행 제안(우선순위 순, 최대 5)
function buildActions(industry: ShopIndustry | null, m: ReportMetrics): OwnerAction[] {
  const out: OwnerAction[] = [];
  const demand = m.tourism.demand;
  const lv = demand?.level;
  const high = lv === "높음" || lv === "매우높음";
  const low = lv === "낮음" || lv === "매우낮음";
  const w = m.environment.live;
  const rain = !!(w && w.sky === "흐림");
  const ind = industry ?? "other";

  // 수요
  if (high) {
    if (ind === "lodging") out.push({ icon: "🛏", text: "객실 풀가동 준비 · 주말 요금 상향 검토", why: `수요 '${lv}'` });
    else if (ind === "food" || ind === "cafe") out.push({ icon: "📦", text: "재료·인력 보강, 대기 동선 준비", why: `수요 '${lv}'` });
    else out.push({ icon: "📈", text: "주말 방문객 증가 대비(재고·인력)", why: `수요 '${lv}'` });
  } else if (low) {
    out.push({ icon: "🏷", text: ind === "lodging" ? "빈 객실 막판 할인·연박 프로모션" : "한산 시간대 프로모션·SNS 노출", why: `수요 '${lv}'` });
  }

  // 날씨
  if (rain) {
    if (ind === "lodging") out.push({ icon: "☔", text: "우천 환불·일정변경 문의 대비", why: "흐림/강수" });
    else out.push({ icon: "☔", text: "실내석 정비 · 우천 메뉴/포장 안내", why: "흐림/강수" });
  }
  if (m.uv && m.uv.todayMax != null && m.uv.todayMax >= 8 && (ind === "cafe" || ind === "food" || ind === "leisure")) {
    out.push({ icon: "🔆", text: "야외석 그늘막·자외선 안내(지수 " + m.uv.todayMax + ")", why: "자외선 매우높음" });
  }

  // 물때(간조) — 갯벌·해변 연계 업종
  const lowTide = (m.tourism.marine?.tide?.events ?? []).find((e) => e.type === "저조" && e.time >= "08:00" && e.time <= "18:00");
  if (lowTide && (ind === "leisure" || ind === "lodging" || ind === "food")) {
    out.push({ icon: "🦪", text: `갯벌체험 적기 ${lowTide.time} 전후 — 손님 안내`, why: "낮 간조" });
  }

  // 축제 임박
  const fest = (m.tourism.festivals ?? []).map((f) => ({ title: f.title, dday: ymd8ToDday(f.start) })).filter((f) => f.dday >= 0 && f.dday <= 7).sort((a, b) => a.dday - b.dday)[0];
  if (fest) out.push({ icon: "🎉", text: `${fest.title} D-${fest.dday} — 방문객 유입 대비`, why: "인근 축제" });

  return out.slice(0, 5);
}

export async function loadOwnerBrief(env: Env, prefs: UserPreferences | null): Promise<OwnerBrief> {
  const metrics = (await getFreshSnapshot(env)) ?? (await loadReportMetrics(env));
  const industry = prefs?.shopProfile?.industry ?? null;
  const festivals = (metrics.tourism.festivals ?? [])
    .map((f) => ({ title: f.title, dday: ymd8ToDday(f.start) }))
    .filter((f) => f.dday >= 0).sort((a, b) => a.dday - b.dday).slice(0, 3);
  return {
    hasShop: !!prefs?.shopProfile,
    industry,
    demand: metrics.tourism.demand,
    weather: metrics.environment.live,
    tide: metrics.tourism.marine?.tide ?? null,
    uv: metrics.uv,
    actions: buildActions(industry, metrics),
    market: {
      festivals,
      gasoline: metrics.oil?.gasoline?.chungnam ?? null,
      aptAvgManwon: metrics.realestate.apt?.avgManwon ?? null,
    },
  };
}

export { INDUSTRY_LABEL };
