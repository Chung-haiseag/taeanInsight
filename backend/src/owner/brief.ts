// 사장님 초개인화 브리프 — OwnerHome 실데이터. 메트릭 스냅샷 재사용(외부 API 추가 호출 없음).
//   주말 수요(forecastDemand)·날씨·물때·자외선 + 업종별 실행 제안(규칙엔진) + 상권 스냅샷.

import type { Env } from "../types";
import type { ShopIndustry, UserPreferences } from "../preferences/types";
import { getFreshSnapshot } from "../reports/metrics_cache";
import { loadReportMetrics, type ReportMetrics } from "../reports/metrics";

export interface OwnerAction { icon: string; text: string; why: string; tag?: string; priority?: number }
// 숙박 전용 운영 보드 — 주말 수요로 예상 가동률·권장가·매출 추정
export interface LodgingBoard {
  weekend: { sat: string; sun: string };
  level: string;
  occRate: number;            // 예상 가동률(%)
  priceMultiplier: number;    // 기본가 대비 권장 배율
  basePrice: number | null;   // 입력한 주말 기본가
  recommendedPrice: number | null; // 권장가(원)
  rooms: number | null;
  estRevenue: number | null;  // 예상 1박 매출(원)
  festivalSoon: { title: string; dday: number } | null;
  weekendRain: boolean;
  notes: string[];
}
// 식음(식당·카페) 운영 보드 — 주말 수요로 예상 혼잡도·손님수·매출 추정
export interface FoodBoard {
  kind: "food" | "cafe";
  weekend: { sat: string; sun: string };
  level: string;
  busyLabel: string;          // 혼잡도(매우 붐빔~매우 한산)
  seats: number | null;       // 좌석 수
  avgTicket: number | null;   // 객단가(원)
  expectedCovers: number | null; // 예상 일 손님 수
  estRevenue: number | null;  // 예상 일 매출(원)
  festivalSoon: { title: string; dday: number } | null;
  rainSoon: boolean;
  notes: string[];
}
export interface OwnerBrief {
  hasShop: boolean;
  industry: ShopIndustry | null;
  demand: ReportMetrics["tourism"]["demand"];
  weather: ReportMetrics["environment"]["live"];
  tide: NonNullable<ReportMetrics["tourism"]["marine"]>["tide"] | null;
  uv: ReportMetrics["uv"];
  actions: OwnerAction[];
  lodging: LodgingBoard | null; // 숙박 업종일 때만
  food: FoodBoard | null;       // 음식 업종일 때만
  market: {
    festivals: Array<{ title: string; dday: number }>;
    gasoline: number | null;
    aptAvgManwon: number | null;
    nearbyLodging?: { total: number; nearbyEup: number | null; eupLabel: string | null } | null;
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

// 숙박 운영 보드 — 주말 수요등급으로 예상 가동률·권장가·매출 추정(규칙기반·투명).
function lodgingBoard(prefs: UserPreferences | null, m: ReportMetrics): LodgingBoard | null {
  const sp = prefs?.shopProfile;
  if (!sp || sp.industry !== "lodging") return null;
  const demand = m.tourism.demand;
  if (!demand?.available) return null;

  const OCC: Record<string, number> = { 매우높음: 0.92, 높음: 0.78, 보통: 0.55, 낮음: 0.35, 매우낮음: 0.2 };
  const MULT: Record<string, number> = { 매우높음: 1.2, 높음: 1.1, 보통: 1.0, 낮음: 0.9, 매우낮음: 0.85 };
  let occ = OCC[demand.level] ?? 0.5;
  let mult = MULT[demand.level] ?? 1.0;

  // 인근 축제(주말 임박) → 가동률·요금 상향
  const fest = (m.tourism.festivals ?? []).map((f) => ({ title: f.title, dday: ymd8ToDday(f.start) }))
    .filter((f) => f.dday >= 0 && f.dday <= 3).sort((a, b) => a.dday - b.dday)[0] ?? null;
  if (fest) { occ += 0.1; mult += 0.05; }
  // 주말 우천 → 가동률 하향
  const weekendRain = [demand.weather?.sat, demand.weather?.sun].some((d) => d && d.pop != null && d.pop >= 60);
  if (weekendRain) occ -= 0.12;
  occ = Math.max(0.1, Math.min(0.98, occ));

  const rooms = sp.capacity && sp.capacity > 0 ? sp.capacity : null;
  const base = sp.weekendPrice ?? sp.basePrice ?? null;
  const recommendedPrice = base ? Math.round((base * mult) / 1000) * 1000 : null;
  const estRevenue = rooms && recommendedPrice ? Math.round(rooms * occ) * recommendedPrice : null;

  const notes: string[] = [];
  if (mult > 1) notes.push(`수요 '${demand.level}' → 주말 요금 ${Math.round((mult - 1) * 100)}% 상향 여력`);
  else if (mult < 1) notes.push(`수요 '${demand.level}' → 막판 할인·연박 프로모션 권장`);
  if (fest) notes.push(`인근 '${fest.title}' D-${fest.dday} — 조기 예약 마감 가능`);
  if (weekendRain) notes.push("주말 강수 예보 — 환불·일정변경 문의 대비");

  return {
    weekend: demand.weekend, level: demand.level,
    occRate: Math.round(occ * 100), priceMultiplier: Math.round(mult * 100) / 100,
    basePrice: base, recommendedPrice, rooms, estRevenue,
    festivalSoon: fest, weekendRain, notes,
  };
}

const EUP_LABEL: Record<string, string> = {
  taean: "태안읍", anmyeon: "안면읍", gonam: "고남면", geunheung: "근흥면",
  nam: "남면", sowon: "소원면", wonbuk: "원북면", iwon: "이원면",
};

// 식음(식당·카페) 운영 보드 — 주말 수요등급으로 예상 혼잡도·손님수·매출 추정(규칙기반).
function foodBoard(prefs: UserPreferences | null, m: ReportMetrics): FoodBoard | null {
  const sp = prefs?.shopProfile;
  if (!sp || (sp.industry !== "food" && sp.industry !== "cafe")) return null;
  const demand = m.tourism.demand;
  if (!demand?.available) return null;
  const isCafe = sp.industry === "cafe";

  // 카페는 회전율이 더 높음(체류 짧음·테이크아웃)
  const TURN: Record<string, number> = isCafe
    ? { 매우높음: 5.0, 높음: 4.0, 보통: 3.0, 낮음: 2.0, 매우낮음: 1.3 }
    : { 매우높음: 3.5, 높음: 2.8, 보통: 2.0, 낮음: 1.3, 매우낮음: 0.9 };
  const BUSY: Record<string, string> = { 매우높음: "매우 붐빔", 높음: "붐빔", 보통: "보통", 낮음: "한산", 매우낮음: "매우 한산" };
  let turn = TURN[demand.level] ?? (isCafe ? 3.0 : 2.0);

  const fest = (m.tourism.festivals ?? []).map((f) => ({ title: f.title, dday: ymd8ToDday(f.start) }))
    .filter((f) => f.dday >= 0 && f.dday <= 3).sort((a, b) => a.dday - b.dday)[0] ?? null;
  if (fest) turn += isCafe ? 0.6 : 0.4;
  const rainSoon = [demand.weather?.sat, demand.weather?.sun].some((d) => d && d.pop != null && d.pop >= 60);
  if (rainSoon) turn -= isCafe ? 0.4 : 0.3;
  turn = Math.max(0.5, turn);

  const seats = sp.capacity && sp.capacity > 0 ? sp.capacity : null;
  const avgTicket = sp.basePrice ?? null;
  const expectedCovers = seats ? Math.round(seats * turn) : null;
  const estRevenue = expectedCovers && avgTicket ? expectedCovers * avgTicket : null;

  const notes: string[] = [];
  const high = demand.level === "높음" || demand.level === "매우높음";
  const low = demand.level === "낮음" || demand.level === "매우낮음";
  const hot = m.environment.live?.temp != null && m.environment.live.temp >= 28;
  if (high) notes.push(isCafe ? "원두·디저트 재고 보강·테이크아웃 동선 준비" : "식자재 추가 발주·인력 보강·웨이팅 동선 준비");
  else if (low) notes.push("한산 시간대 세트·SNS 프로모션 권장");
  if (isCafe && hot) notes.push("아이스 음료·빙수 재료 추가 준비(더위)");
  if (fest) notes.push(`인근 '${fest.title}' D-${fest.dday} — 손님 급증 대비`);
  if (rainSoon) notes.push(isCafe ? "주말 강수 — 테이크아웃·배달 강화" : "주말 강수 — 배달·포장 비중 강화");

  return {
    kind: isCafe ? "cafe" : "food",
    weekend: demand.weekend, level: demand.level, busyLabel: BUSY[demand.level] ?? "보통",
    seats, avgTicket, expectedCovers, estRevenue, festivalSoon: fest, rainSoon, notes,
  };
}

export async function loadOwnerBrief(env: Env, prefs: UserPreferences | null): Promise<OwnerBrief> {
  const metrics = (await getFreshSnapshot(env)) ?? (await loadReportMetrics(env));
  const industry = prefs?.shopProfile?.industry ?? null;
  const festivals = (metrics.tourism.festivals ?? [])
    .map((f) => ({ title: f.title, dday: ymd8ToDday(f.start) }))
    .filter((f) => f.dday >= 0).sort((a, b) => a.dday - b.dday).slice(0, 3);

  // 숙박 업종이면 주변 숙박업소 수(TourAPI searchStay) — 읍·면 분포까지
  let nearbyLodging: { total: number; nearbyEup: number | null; eupLabel: string | null } | null = null;
  if (industry === "lodging") {
    try {
      const { fetchStay } = await import("../env/tour");
      const stay = await fetchStay(env);
      if (stay.available) {
        const eupCode = prefs?.shopProfile?.eupMyeon ?? prefs?.regions?.[0];
        const eupLabel = eupCode ? EUP_LABEL[eupCode] ?? null : null;
        const nearbyEup = eupLabel ? stay.items.filter((x) => x.addr.includes(eupLabel)).length : null;
        nearbyLodging = { total: stay.total, nearbyEup, eupLabel };
      }
    } catch { /* 무시 */ }
  }

  return {
    hasShop: !!prefs?.shopProfile,
    industry,
    demand: metrics.tourism.demand,
    weather: metrics.environment.live,
    tide: metrics.tourism.marine?.tide ?? null,
    uv: metrics.uv,
    actions: buildActions(industry, metrics),
    lodging: lodgingBoard(prefs, metrics),
    food: foodBoard(prefs, metrics),
    market: {
      festivals,
      gasoline: metrics.oil?.gasoline?.chungnam ?? null,
      aptAvgManwon: metrics.realestate.apt?.avgManwon ?? null,
      nearbyLodging,
    },
  };
}

export { INDUSTRY_LABEL };
