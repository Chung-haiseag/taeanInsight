// 사장님 초개인화 브리프 — OwnerHome 실데이터. 메트릭 스냅샷 재사용(외부 API 추가 호출 없음).
//   주말 수요(forecastDemand)·날씨·물때·자외선 + 업종별 실행 제안(규칙엔진) + 상권 스냅샷.

import type { Env } from "../types";
import type { ShopIndustry, UserPreferences } from "../preferences/types";
import { getFreshSnapshot } from "../reports/metrics_cache";
import { loadReportMetrics, type ReportMetrics } from "../reports/metrics";

export interface OwnerAction { icon: string; text: string; why: string; tag?: string; priority?: number }
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

// 업종 × 수요·추세 × 날씨 × 바다 × 시간대 → 실행 제안(우선순위 정렬, 최대 6).
//   priority: 1=안전/긴급, 2=매출(수요), 3=날씨/추세, 4=기회(물때·축제·자외선). 낮을수록 먼저.
function buildActions(industry: ShopIndustry | null, m: ReportMetrics): OwnerAction[] {
  const out: OwnerAction[] = [];
  const ind = industry ?? "other";
  const food = ind === "food" || ind === "cafe";
  const beachLinked = ind === "leisure" || ind === "lodging" || ind === "food";
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const hour = k.getUTCHours();
  const morning = hour < 11;        // 오전: 오늘 준비 / 오후: 내일·주말 대비

  const demand = m.tourism.demand;
  const lv = demand?.level;
  const high = lv === "높음" || lv === "매우높음";
  const low = lv === "낮음" || lv === "매우낮음";
  const w = m.environment.live;

  // ── 1) 안전·긴급 ──
  const wave = Math.max(0, ...(m.tourism.marine?.beaches ?? []).map((b) => b.waveHeight ?? 0));
  if (wave >= 2 && beachLinked) {
    out.push({ icon: "🌊", text: `파고 ${wave.toFixed(1)}m — 해변·해상 활동 자제 안내`, why: "높은 파고", tag: "안전", priority: 1 });
  }
  if (w?.grade === "나쁨" || w?.grade === "매우나쁨") {
    out.push({ icon: "😷", text: `대기질 '${w.grade}' — 실내 좌석·환기, 민감군 안내`, why: `PM10 ${w.pm10 ?? "—"}`, tag: "안전", priority: 1 });
  }
  if (w?.temp != null && w.temp >= 31) {
    out.push({ icon: "🥵", text: food ? "시원한 메뉴·냉방 점검, 야외석 차양" : "냉방·그늘·생수 비치", why: `기온 ${w.temp}℃`, tag: "안전", priority: 1 });
  } else if (w?.temp != null && w.temp <= 0) {
    out.push({ icon: "🧊", text: "난방·온수·결빙 대비", why: `기온 ${w.temp}℃`, tag: "안전", priority: 1 });
  }

  // ── 2) 매출(수요) — 업종 세분화 ──
  if (high) {
    if (ind === "lodging") out.push({ icon: "🛏", text: morning ? "객실 풀가동 준비 · 노쇼 대비 예약금 안내" : "주말 요금 상향·만실 대비 예약 마감 점검", why: `수요 '${lv}'`, tag: "매출", priority: 2 });
    else if (ind === "food") out.push({ icon: "🍽", text: morning ? "식자재 추가 발주·인력 보강" : "피크 회전율·예약/웨이팅 동선 준비", why: `수요 '${lv}'`, tag: "매출", priority: 2 });
    else if (ind === "cafe") out.push({ icon: "☕", text: "음료·디저트 재고 보강, 테이크아웃 동선 준비", why: `수요 '${lv}'`, tag: "매출", priority: 2 });
    else if (ind === "leisure") out.push({ icon: "🎟", text: "예약 슬롯 확대·안전요원/장비 점검", why: `수요 '${lv}'`, tag: "매출", priority: 2 });
    else if (ind === "retail") out.push({ icon: "🛍", text: "인기 품목 재고 보강·영업시간 연장 검토", why: `수요 '${lv}'`, tag: "매출", priority: 2 });
    else out.push({ icon: "📈", text: "주말 방문객 증가 대비(재고·인력)", why: `수요 '${lv}'`, tag: "매출", priority: 2 });
  } else if (low) {
    out.push({ icon: "🏷", text: ind === "lodging" ? "빈 객실 막판 할인·연박 프로모션" : "한산 시간대 프로모션·SNS·세트 할인", why: `수요 '${lv}'`, tag: "매출", priority: 2 });
  }

  // ── 3) 추세(전주 대비)·주말 날씨 ──
  const t = m.trends;
  if (t?.interest && t.interest.delta >= 20) {
    out.push({ icon: "🔎", text: "검색 관심도 급증 — 예약·문의 응대 대비, 게시물 노출↑", why: `검색 전주 대비 +${Math.round(t.interest.delta)}%`, tag: "추세", priority: 3 });
  }
  if (t?.demand && t.demand.delta >= 10) {
    out.push({ icon: "📊", text: "수요 상승세 — 주말 인력·재고 미리 확보", why: `수요 전주 대비 +${Math.round(t.demand.delta)}`, tag: "추세", priority: 3 });
  }
  // 주말 강수 확률(데이터랩보다 정확) — 환불/실내 대비
  const wkRain = [demand?.weather?.sat, demand?.weather?.sun].some((d) => d && d.pop != null && d.pop >= 60);
  if (wkRain) {
    out.push({ icon: "☔", text: ind === "lodging" ? "주말 우천 — 환불·일정변경 문의 대비, 실내 프로그램 안내" : "주말 우천 — 실내석·포장/배달·우천 메뉴 준비", why: "주말 강수확률 60%+", tag: "날씨", priority: 3 });
  }

  // ── 4) 기회(물때·자외선·축제) ──
  if (m.uv?.todayMax != null && m.uv.todayMax >= 8 && (food || ind === "leisure")) {
    out.push({ icon: "🔆", text: `자외선 매우높음(지수 ${m.uv.todayMax}) — 야외석 그늘막·선케어 안내`, why: m.uv.peakHour ? `최고 ${m.uv.peakHour}` : "한낮 주의", tag: "기회", priority: 4 });
  }
  const lowTide = (m.tourism.marine?.tide?.events ?? []).find((e) => e.type === "저조" && e.time >= "08:00" && e.time <= "18:00");
  if (lowTide && beachLinked) {
    out.push({ icon: "🦪", text: `갯벌체험 적기 ${lowTide.time} 전후 — 손님 안내`, why: "낮 간조", tag: "기회", priority: 4 });
  }
  const fest = (m.tourism.festivals ?? []).map((f) => ({ title: f.title, dday: ymd8ToDday(f.start) })).filter((f) => f.dday >= 0 && f.dday <= 7).sort((a, b) => a.dday - b.dday)[0];
  if (fest) out.push({ icon: "🎉", text: `${fest.title} D-${fest.dday} — 방문객 유입 대비`, why: "인근 축제", tag: "기회", priority: 4 });

  return out.sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9)).slice(0, 6);
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
