// 사장님 초개인화 브리프 — OwnerHome 실데이터. 메트릭 스냅샷 재사용(외부 API 추가 호출 없음).
//   주말 수요(forecastDemand)·날씨·물때·자외선 + 업종별 실행 제안(규칙엔진) + 상권 스냅샷.

import type { Env } from "../types";
import type { ShopIndustry, UserPreferences } from "../preferences/types";
import { getFreshSnapshot } from "../reports/metrics_cache";
import { loadReportMetrics, type ReportMetrics } from "../reports/metrics";
import { REGION } from "../region";

// 읍·면 코드 → 라벨 (지역설정에서 파생)
const EUP_LABEL: Record<string, string> = Object.fromEntries(REGION.eupMyeon.map((e) => [e.code, e.label]));

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
// 레저·체험 운영 보드 — 날씨·파고·수요로 예상 참가율·참가자·매출 추정(야외 민감)
export interface LeisureBoard {
  weekend: { sat: string; sun: string };
  level: string;
  fitLabel: string;            // 야외 활동 적합도(좋음/보통/주의)
  capacity: number | null;     // 일 정원
  price: number | null;        // 1인 체험료
  expectedGuests: number | null;
  estRevenue: number | null;
  highWave: boolean;
  rainSoon: boolean;
  festivalSoon: { title: string; dday: number } | null;
  notes: string[];
}
// 소매·상점 운영 보드 — 평일 평균 방문객 × 주말 수요배율로 예상 방문·매출 추정
export interface RetailBoard {
  weekend: { sat: string; sun: string };
  level: string;
  busyLabel: string;
  baselineVisitors: number | null; // 평일 평균 일 방문객
  avgTicket: number | null;        // 객단가(원)
  multiplier: number;              // 평일 대비 주말 배율
  expectedVisitors: number | null;
  estRevenue: number | null;
  festivalSoon: { title: string; dday: number } | null;
  rainSoon: boolean;
  notes: string[];
}
// 낚시·수산 운영 보드 — 파고·풍속 출항 가부 + 물때·수온 + 선상낚시 매출
export interface FishingBoard {
  weekend: { sat: string; sun: string };
  level: string;
  goLabel: string;             // 출항 가부(양호/주의/위험)
  waveHeight: number | null;
  windSpeed: number | null;
  waterTemp: number | null;
  nextTide: { time: string; type: string } | null;
  sunrise: string | null;
  sunset: string | null;
  seats: number | null;        // 승선 정원
  price: number | null;        // 1인 요금
  expectedGuests: number | null;
  estRevenue: number | null;
  festivalSoon: { title: string; dday: number } | null;
  notes: string[];
}
// 염전(천일염) 운영 보드 — 채염 적기(맑음·무강수·바람)
export interface SaltBoard {
  harvestLabel: string;        // 채염 적합도(최적/가능/불가)
  sky: string | null;
  pty: string | null;
  windSpeed: number | null;
  weekendRain: boolean;
  notes: string[];
}
// 농업 운영 보드 — 영농 기상 경보(강수·폭염·강풍 등)
export interface FarmingBoard {
  statusLabel: string;         // 영농 여건(양호/주의/경보)
  todayTemp: number | null;
  weekendMaxTemp: number | null;
  weekendRain: boolean;
  alerts: Array<{ icon: string; text: string }>;
  notes: string[];
}
// 여행사 운영 보드 — 투어 진행 적합도 + 예약·매출 + 축제 연계 상품
export interface TravelBoard {
  weekend: { sat: string; sun: string };
  level: string;
  fitLabel: string;            // 투어 진행 적합도(좋음/보통/주의)
  capacity: number | null;     // 일 투어 정원
  price: number | null;        // 1인 상품가
  expectedBookings: number | null;
  estRevenue: number | null;
  highWave: boolean;
  rainSoon: boolean;
  festivalSoon: { title: string; dday: number } | null;
  notes: string[];
}
// 부동산 중개 운영 보드 — 실거래 기반 시세·㎡단가·거래량·읍면
export interface RealtorBoard {
  aptCount: number;
  aptAvgManwon: number;
  aptPerM2Manwon: number | null;  // ㎡당 만원
  aptPerPyeongManwon: number | null; // 평당 만원
  landCount: number;
  eupLabel: string | null;
  eupAptCount: number | null;
  recent: Array<{ dong: string; name: string; manwon: number; area: string }>;
  notes: string[];
}
// 골프장 운영 보드 — 주말 라운딩 적합도 + 예약·매출
export interface GolfBoard {
  weekend: { sat: string; sun: string };
  level: string;
  fitLabel: string;            // 라운딩 적합도(좋음/보통/주의)
  weekendMaxTemp: number | null;
  weekendRain: boolean;
  windSpeed: number | null;
  capacity: number | null;     // 일 내장객 정원
  greenFee: number | null;     // 1인 그린피
  expectedRounds: number | null;
  estRevenue: number | null;
  notes: string[];
}
// 양식·수산 운영 보드 — 수온·기상 작업 가부 + 적조·빈산소 주의
export interface AquaBoard {
  statusLabel: string;         // 양식 여건(양호/주의/경보)
  waterTemp: number | null;
  waveHeight: number | null;
  weekendRain: boolean;
  alerts: Array<{ icon: string; text: string }>;
  notes: string[];
}
export interface OwnerBrief {
  hasShop: boolean;
  industry: ShopIndustry | null;
  demand: ReportMetrics["tourism"]["demand"];
  weather: ReportMetrics["environment"]["live"];
  tide: NonNullable<ReportMetrics["tourism"]["marine"]>["tide"] | null;
  sun: NonNullable<ReportMetrics["tourism"]["marine"]>["sun"] | null;
  uv: ReportMetrics["uv"];
  actions: OwnerAction[];
  lodging: LodgingBoard | null; // 숙박 업종일 때만
  food: FoodBoard | null;       // 음식·카페 업종일 때만
  leisure: LeisureBoard | null; // 레저·체험 업종일 때만
  retail: RetailBoard | null;   // 소매·상점 업종일 때만
  fishing: FishingBoard | null; // 낚시·수산 업종일 때만
  salt: SaltBoard | null;       // 염전 업종일 때만
  farming: FarmingBoard | null; // 농업 업종일 때만
  travel: TravelBoard | null;   // 여행사 업종일 때만
  realtor: RealtorBoard | null; // 부동산 중개 업종일 때만
  golf: GolfBoard | null;       // 골프장 업종일 때만
  aqua: AquaBoard | null;       // 양식·수산 업종일 때만
  market: {
    festivals: Array<{ title: string; dday: number }>;
    gasoline: number | null;
    aptAvgManwon: number | null;
    nearbyLodging?: { total: number; nearbyEup: number | null; eupLabel: string | null } | null;
  };
}

const INDUSTRY_LABEL: Record<ShopIndustry, string> = {
  lodging: "숙박", food: "음식", cafe: "카페", leisure: "레저·체험", retail: "소매",
  fishing: "낚시·수산", salt: "염전", farming: "농업", travel: "여행사",
  realtor: "부동산 중개", golf: "골프장", aqua: "양식·수산", other: "기타",
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

// 레저·체험 운영 보드 — 수요·날씨·파고로 예상 참가율·참가자·매출(야외 민감).
function leisureBoard(prefs: UserPreferences | null, m: ReportMetrics): LeisureBoard | null {
  const sp = prefs?.shopProfile;
  if (!sp || sp.industry !== "leisure") return null;
  const demand = m.tourism.demand;
  if (!demand?.available) return null;

  const RATE: Record<string, number> = { 매우높음: 0.9, 높음: 0.7, 보통: 0.5, 낮음: 0.3, 매우낮음: 0.15 };
  let rate = RATE[demand.level] ?? 0.5;

  const fest = (m.tourism.festivals ?? []).map((f) => ({ title: f.title, dday: ymd8ToDday(f.start) }))
    .filter((f) => f.dday >= 0 && f.dday <= 3).sort((a, b) => a.dday - b.dday)[0] ?? null;
  if (fest) rate += 0.1;
  const rainSoon = [demand.weather?.sat, demand.weather?.sun].some((d) => d && d.pop != null && d.pop >= 60);
  if (rainSoon) rate -= 0.2;
  rate = Math.max(0.05, Math.min(0.98, rate));

  const wave = Math.max(0, ...(m.tourism.marine?.beaches ?? []).map((b) => b.waveHeight ?? 0));
  const highWave = wave >= 1.5;

  const capacity = sp.capacity && sp.capacity > 0 ? sp.capacity : null;
  const price = sp.basePrice ?? null;
  const expectedGuests = capacity ? Math.round(capacity * rate) : null;
  const estRevenue = expectedGuests && price ? expectedGuests * price : null;

  const fitLabel = rainSoon ? "주의(우천)" : highWave ? "주의(파고)" : (demand.level === "높음" || demand.level === "매우높음") ? "좋음" : "보통";
  const notes: string[] = [];
  if (rainSoon) notes.push("주말 강수 — 실내 대체 프로그램·환불 규정 안내");
  if (highWave) notes.push(`파고 ${wave.toFixed(1)}m — 수상 활동 안전 점검·일정 조정`);
  if (fest) notes.push(`인근 '${fest.title}' D-${fest.dday} — 예약 슬롯 확대`);
  if (demand.level === "낮음" || demand.level === "매우낮음") notes.push("한산 — 단체·패키지 프로모션 권장");

  return {
    weekend: demand.weekend, level: demand.level, fitLabel,
    capacity, price, expectedGuests, estRevenue, highWave, rainSoon, festivalSoon: fest, notes,
  };
}

// 소매·상점 운영 보드 — 평일 평균 방문객 × 주말 수요배율(규칙기반).
function retailBoard(prefs: UserPreferences | null, m: ReportMetrics): RetailBoard | null {
  const sp = prefs?.shopProfile;
  if (!sp || sp.industry !== "retail") return null;
  const demand = m.tourism.demand;
  if (!demand?.available) return null;

  const MULT: Record<string, number> = { 매우높음: 1.8, 높음: 1.4, 보통: 1.0, 낮음: 0.7, 매우낮음: 0.5 };
  const BUSY: Record<string, string> = { 매우높음: "매우 붐빔", 높음: "붐빔", 보통: "보통", 낮음: "한산", 매우낮음: "매우 한산" };
  let mult = MULT[demand.level] ?? 1.0;

  const fest = (m.tourism.festivals ?? []).map((f) => ({ title: f.title, dday: ymd8ToDday(f.start) }))
    .filter((f) => f.dday >= 0 && f.dday <= 3).sort((a, b) => a.dday - b.dday)[0] ?? null;
  if (fest) mult += 0.2;
  const rainSoon = [demand.weather?.sat, demand.weather?.sun].some((d) => d && d.pop != null && d.pop >= 60);
  if (rainSoon) mult -= 0.15;
  mult = Math.max(0.3, Math.round(mult * 100) / 100);

  const baselineVisitors = sp.capacity && sp.capacity > 0 ? sp.capacity : null;
  const avgTicket = sp.basePrice ?? null;
  const expectedVisitors = baselineVisitors ? Math.round(baselineVisitors * mult) : null;
  const estRevenue = expectedVisitors && avgTicket ? expectedVisitors * avgTicket : null;

  const notes: string[] = [];
  const high = demand.level === "높음" || demand.level === "매우높음";
  const low = demand.level === "낮음" || demand.level === "매우낮음";
  if (high) notes.push("인기 품목 재고 보강·영업시간 연장 검토");
  else if (low) notes.push("한산 — 묶음·기획전 프로모션 권장");
  if (fest) notes.push(`인근 '${fest.title}' D-${fest.dday} — 방문객 유입 대비`);
  if (rainSoon) notes.push("주말 강수 — 실내 동선·온라인 주문 안내");

  return {
    weekend: demand.weekend, level: demand.level, busyLabel: BUSY[demand.level] ?? "보통",
    baselineVisitors, avgTicket, multiplier: mult, expectedVisitors, estRevenue, festivalSoon: fest, rainSoon, notes,
  };
}

// 낚시·수산 보드 — 파고·풍속으로 출항 가부, 물때·수온, 선상낚시 매출.
function fishingBoard(prefs: UserPreferences | null, m: ReportMetrics): FishingBoard | null {
  const sp = prefs?.shopProfile;
  if (!sp || sp.industry !== "fishing") return null;
  const demand = m.tourism.demand;
  if (!demand?.available) return null;
  const marine = m.tourism.marine;

  const wave = Math.max(0, ...(marine?.beaches ?? []).map((b) => b.waveHeight ?? 0)) || (marine?.surf?.wave ?? null) || null;
  const wind = Math.max(0, ...(marine?.beaches ?? []).map((b) => b.wind ?? 0)) || (marine?.surf?.wind ?? null) || null;
  const waterTemp = (marine?.beaches ?? []).map((b) => b.waterTemp).find((t) => t != null) ?? marine?.surf?.waterTemp ?? null;

  // 출항 가부 — 파고·풍속 기준(소형 선박 안전)
  const danger = (wave != null && wave >= 2.0) || (wind != null && wind >= 14);
  const caution = (wave != null && wave >= 1.5) || (wind != null && wind >= 10);
  const goLabel = danger ? "위험" : caution ? "주의" : "양호";

  // 다음 물때(만조/간조) — 현재 시각 이후 첫 이벤트
  const nowHM = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(11, 16);
  const ev = (marine?.tide?.events ?? []).find((e) => (e.time ?? "").slice(0, 5) >= nowHM) ?? (marine?.tide?.events ?? [])[0] ?? null;
  const nextTide = ev ? { time: (ev.time ?? "").slice(0, 5), type: ev.type } : null;

  // 선상낚시(차터) 매출 — 정원·요금 입력 시. 위험이면 운항 어려워 0 가정.
  const RATE: Record<string, number> = { 매우높음: 0.95, 높음: 0.8, 보통: 0.6, 낮음: 0.4, 매우낮음: 0.2 };
  let rate = RATE[demand.level] ?? 0.6;
  if (danger) rate = 0; else if (caution) rate *= 0.7;
  const seats = sp.capacity && sp.capacity > 0 ? sp.capacity : null;
  const price = sp.basePrice ?? null;
  const expectedGuests = seats ? Math.round(seats * rate) : null;
  const estRevenue = expectedGuests != null && price ? expectedGuests * price : null;

  const fest = (m.tourism.festivals ?? []).map((f) => ({ title: f.title, dday: ymd8ToDday(f.start) }))
    .filter((f) => f.dday >= 0 && f.dday <= 3).sort((a, b) => a.dday - b.dday)[0] ?? null;

  const notes: string[] = [];
  if (danger) notes.push(`파고 ${wave?.toFixed(1) ?? "?"}m·풍속 ${wind?.toFixed(0) ?? "?"}m/s — 출항 자제·예약 연기 권장`);
  else if (caution) notes.push("기상 주의 — 구명조끼·통신 점검, 무리한 원거리 자제");
  else notes.push("출항 양호 — 안전장비 점검 후 운항");
  if (nextTide) notes.push(`다음 ${nextTide.type} ${nextTide.time} — 조류 시간대 조과 유리`);
  if (waterTemp != null) notes.push(`수온 ${waterTemp}℃`);
  if (fest) notes.push(`인근 '${fest.title}' D-${fest.dday} — 예약 문의 증가 대비`);

  return {
    weekend: demand.weekend, level: demand.level, goLabel,
    waveHeight: wave, windSpeed: wind, waterTemp,
    nextTide, sunrise: marine?.sun?.sunrise ?? null, sunset: marine?.sun?.sunset ?? null,
    seats, price, expectedGuests, estRevenue, festivalSoon: fest, notes,
  };
}

// 염전(천일염) 보드 — 채염 적기(맑음·무강수·바람).
function saltBoard(prefs: UserPreferences | null, m: ReportMetrics): SaltBoard | null {
  const sp = prefs?.shopProfile;
  if (!sp || sp.industry !== "salt") return null;
  const w = m.environment.live;
  const sky = w?.sky ?? null;
  const wind = Math.max(0, ...(m.tourism.marine?.beaches ?? []).map((b) => b.wind ?? 0)) || null;
  const demand = m.tourism.demand;
  const weekendRain = [demand?.weather?.sat, demand?.weather?.sun].some((d) => d && d.pop != null && d.pop >= 60);

  const sunny = sky?.includes("맑") ?? false;
  const cloudy = sky?.includes("흐") ?? false;
  const harvestLabel = cloudy ? "불가" : sunny ? "최적" : "가능";

  const notes: string[] = [];
  if (harvestLabel === "최적") notes.push("맑고 건조 — 채염 적기, 결정지 관리·수확 집중");
  else if (harvestLabel === "불가") notes.push("흐림 — 증발 더딤, 무리한 채염 자제");
  else notes.push("부분 가능 — 일사·바람 보아 오후 채염 판단");
  if (wind != null && wind >= 3) notes.push(`바람 ${wind.toFixed(0)}m/s — 증발 촉진(유리)`);
  if (weekendRain) notes.push("주말 강수 예보 — 결정지 덮개·배수 준비");

  return { harvestLabel, sky, pty: null, windSpeed: wind, weekendRain, notes };
}

// 농업 보드 — 영농 기상 경보(폭염·강수·강풍·저온).
function farmingBoard(prefs: UserPreferences | null, m: ReportMetrics): FarmingBoard | null {
  const sp = prefs?.shopProfile;
  if (!sp || sp.industry !== "farming") return null;
  const w = m.environment.live;
  const demand = m.tourism.demand;
  const todayTemp = w?.temp ?? null;
  const weekendMaxTemp = Math.max(demand?.weather?.sat?.tmax ?? -99, demand?.weather?.sun?.tmax ?? -99);
  const wkMax = weekendMaxTemp > -99 ? weekendMaxTemp : null;
  const weekendRain = [demand?.weather?.sat, demand?.weather?.sun].some((d) => d && d.pop != null && d.pop >= 60);
  const wind = Math.max(0, ...(m.tourism.marine?.beaches ?? []).map((b) => b.wind ?? 0)) || null;

  const alerts: { icon: string; text: string }[] = [];
  if ((todayTemp != null && todayTemp >= 33) || (wkMax != null && wkMax >= 33)) alerts.push({ icon: "🥵", text: "폭염 — 관수·차광, 오전·저녁 작업·일꾼 온열질환 주의" });
  if (todayTemp != null && todayTemp <= 3) alerts.push({ icon: "❄️", text: "저온·서리 — 보온덮개·방상팬, 정식 시기 조정" });
  if (weekendRain) alerts.push({ icon: "🌧", text: "주말 강수 — 배수로 점검·약제 살포 일정 조정·수확 앞당김" });
  if (wind != null && wind >= 9) alerts.push({ icon: "💨", text: `강풍(${wind.toFixed(0)}m/s) — 지주·하우스 비닐 고정` });
  if (w?.grade === "나쁨" || w?.grade === "매우나쁨") alerts.push({ icon: "😷", text: "대기질 나쁨 — 노지 장시간 작업 시 마스크" });

  const statusLabel = alerts.some((a) => a.icon === "🥵" || a.icon === "❄️" || a.icon === "💨") ? "경보" : alerts.length ? "주의" : "양호";
  const notes: string[] = [];
  if (!alerts.length) notes.push("특이 기상 경보 없음 — 평상 영농 진행");
  notes.push(`${REGION.name} 주요 작물: ${REGION.farmCrops} — 생육기 기상 점검`);

  return { statusLabel, todayTemp, weekendMaxTemp: wkMax, weekendRain, alerts, notes };
}

// 여행사 보드 — 수요·날씨·파고로 투어 진행 적합도·예약·매출(축제 연계).
function travelBoard(prefs: UserPreferences | null, m: ReportMetrics): TravelBoard | null {
  const sp = prefs?.shopProfile;
  if (!sp || sp.industry !== "travel") return null;
  const demand = m.tourism.demand;
  if (!demand?.available) return null;

  const RATE: Record<string, number> = { 매우높음: 0.9, 높음: 0.72, 보통: 0.55, 낮음: 0.35, 매우낮음: 0.18 };
  let rate = RATE[demand.level] ?? 0.55;
  const fest = (m.tourism.festivals ?? []).map((f) => ({ title: f.title, dday: ymd8ToDday(f.start) }))
    .filter((f) => f.dday >= 0 && f.dday <= 7).sort((a, b) => a.dday - b.dday)[0] ?? null;
  if (fest && fest.dday <= 3) rate += 0.1;
  const rainSoon = [demand.weather?.sat, demand.weather?.sun].some((d) => d && d.pop != null && d.pop >= 60);
  if (rainSoon) rate -= 0.15;
  rate = Math.max(0.05, Math.min(0.98, rate));

  const wave = Math.max(0, ...(m.tourism.marine?.beaches ?? []).map((b) => b.waveHeight ?? 0));
  const highWave = wave >= 1.5;
  const fitLabel = rainSoon ? "주의(우천)" : highWave ? "주의(해상)" : (demand.level === "높음" || demand.level === "매우높음") ? "좋음" : "보통";

  const capacity = sp.capacity && sp.capacity > 0 ? sp.capacity : null;
  const price = sp.basePrice ?? null;
  const expectedBookings = capacity ? Math.round(capacity * rate) : null;
  const estRevenue = expectedBookings && price ? expectedBookings * price : null;

  const notes: string[] = [];
  if (fest) notes.push(`'${fest.title}' D-${fest.dday} — 축제 연계 패키지·셔틀 상품 기획`);
  if (rainSoon) notes.push("주말 강수 — 실내·우천 대체 코스 준비, 환불 규정 안내");
  if (highWave) notes.push(`파고 ${wave.toFixed(1)}m — 섬·유람선 등 해상 투어 일정 조정`);
  if (demand.level === "낮음" || demand.level === "매우낮음") notes.push("비수기 — 단체·제휴 할인 프로모션 권장");
  if (!notes.length) notes.push("투어 진행 양호 — 가이드·차량 배차 점검");

  return { weekend: demand.weekend, level: demand.level, fitLabel, capacity, price, expectedBookings, estRevenue, highWave, rainSoon, festivalSoon: fest, notes };
}

// 부동산 중개 보드 — 국토부 실거래 기반 시세·㎡단가·거래량·읍면.
function realtorBoard(prefs: UserPreferences | null, m: ReportMetrics): RealtorBoard | null {
  const sp = prefs?.shopProfile;
  if (!sp || sp.industry !== "realtor") return null;
  const re = m.realestate;
  if (!re.apt && !re.land) return null;
  const apt = re.apt;
  const items = apt?.items ?? [];
  // ㎡당 단가 — manwon / 전용면적(area)
  const perM2s = items.map((it) => { const a = parseFloat(it.area); return a > 0 ? it.manwon / a : null; }).filter((x): x is number => x != null && isFinite(x));
  const aptPerM2Manwon = perM2s.length ? Math.round(perM2s.reduce((s, n) => s + n, 0) / perM2s.length) : null;
  const aptPerPyeongManwon = aptPerM2Manwon != null ? Math.round(aptPerM2Manwon * 3.305) : null;

  const eupCode = sp.eupMyeon ?? prefs?.regions?.[0];
  const eupLabel = eupCode ? EUP_LABEL[eupCode] ?? null : null;
  const eupAptCount = eupLabel ? items.filter((it) => (it.dong ?? "").includes(eupLabel)).length : null;
  const recent = items.slice(0, 3).map((it) => ({ dong: it.dong, name: it.name, manwon: it.manwon, area: it.area }));

  const notes: string[] = [];
  const cnt = apt?.count ?? 0;
  if (cnt >= 8) notes.push("거래 활발 — 매물 확보·신규 문의 응대 강화");
  else if (cnt <= 2) notes.push("거래 한산 — 급매·실수요 매물 위주 홍보");
  if (eupLabel && eupAptCount != null) notes.push(`${eupLabel} 최근 아파트 거래 ${eupAptCount}건`);
  notes.push("실거래 6개월 누적 — 상세 추이는 B2B 대시보드 참고");

  return {
    aptCount: cnt, aptAvgManwon: apt?.avgManwon ?? 0, aptPerM2Manwon, aptPerPyeongManwon,
    landCount: re.land?.count ?? 0, eupLabel, eupAptCount, recent, notes,
  };
}

// 골프장 보드 — 주말 라운딩 적합도(강수·강풍·폭염) + 예약·매출.
function golfBoard(prefs: UserPreferences | null, m: ReportMetrics): GolfBoard | null {
  const sp = prefs?.shopProfile;
  if (!sp || sp.industry !== "golf") return null;
  const demand = m.tourism.demand;
  if (!demand?.available) return null;

  const wkMaxRaw = Math.max(demand.weather?.sat?.tmax ?? -99, demand.weather?.sun?.tmax ?? -99);
  const weekendMaxTemp = wkMaxRaw > -99 ? wkMaxRaw : null;
  const weekendRain = [demand.weather?.sat, demand.weather?.sun].some((d) => d && d.pop != null && d.pop >= 60);
  const wind = Math.max(0, ...(m.tourism.marine?.beaches ?? []).map((b) => b.wind ?? 0)) || null;
  const hot = weekendMaxTemp != null && weekendMaxTemp >= 33;
  const windy = wind != null && wind >= 9;
  const fitLabel = weekendRain ? "주의(우천)" : windy ? "주의(강풍)" : hot ? "주의(폭염)" : "좋음";

  const RATE: Record<string, number> = { 매우높음: 0.95, 높음: 0.85, 보통: 0.7, 낮음: 0.5, 매우낮음: 0.3 };
  let rate = RATE[demand.level] ?? 0.7;
  if (weekendRain) rate -= 0.3; else if (hot || windy) rate -= 0.1;
  rate = Math.max(0.1, Math.min(0.99, rate));
  const capacity = sp.capacity && sp.capacity > 0 ? sp.capacity : null;
  const greenFee = sp.basePrice ?? null;
  const expectedRounds = capacity ? Math.round(capacity * rate) : null;
  const estRevenue = expectedRounds && greenFee ? expectedRounds * greenFee : null;

  const notes: string[] = [];
  if (weekendRain) notes.push("주말 강수 — 예약 변동·우천 환불·카트 통제 대비");
  if (hot) notes.push("폭염 — 새벽·薄暮 티타임 권장, 그늘집 수분 보강");
  if (windy) notes.push(`강풍(${wind?.toFixed(0)}m/s) — 라운딩 난이도·안전 안내`);
  if (!notes.length) notes.push("라운딩 양호 — 주말 부킹 마감·캐디 배치 점검");

  return { weekend: demand.weekend, level: demand.level, fitLabel, weekendMaxTemp, weekendRain, windSpeed: wind, capacity, greenFee, expectedRounds, estRevenue, notes };
}

// 양식·수산 보드 — 수온·기상으로 작업 가부·적조/빈산소 주의.
function aquaBoard(prefs: UserPreferences | null, m: ReportMetrics): AquaBoard | null {
  const sp = prefs?.shopProfile;
  if (!sp || sp.industry !== "aqua") return null;
  const marine = m.tourism.marine;
  const waterTemp = (marine?.beaches ?? []).map((b) => b.waterTemp).find((t) => t != null) ?? marine?.surf?.waterTemp ?? null;
  const wave = Math.max(0, ...(marine?.beaches ?? []).map((b) => b.waveHeight ?? 0)) || null;
  const demand = m.tourism.demand;
  const weekendRain = [demand?.weather?.sat, demand?.weather?.sun].some((d) => d && d.pop != null && d.pop >= 60);

  const alerts: { icon: string; text: string }[] = [];
  if (waterTemp != null && waterTemp >= 28) alerts.push({ icon: "🌡", text: `고수온(${waterTemp}℃) — 빈산소·폐사 주의, 산소공급·먹이 조절` });
  if (waterTemp != null && waterTemp >= 24) alerts.push({ icon: "🦠", text: "적조 발생 가능 수온대 — 예찰·차단막 점검" });
  if (waterTemp != null && waterTemp <= 4) alerts.push({ icon: "❄️", text: `저수온(${waterTemp}℃) — 동해(凍害) 주의, 수하·이동 검토` });
  if (wave != null && wave >= 1.5) alerts.push({ icon: "🌊", text: `파고 ${wave.toFixed(1)}m — 양식장 작업·채취 안전 점검` });
  if (weekendRain) alerts.push({ icon: "🌧", text: "주말 강수 — 담수 유입·염도 변화 주의(굴·바지락)" });

  const statusLabel = alerts.some((a) => a.icon === "🌡" || a.icon === "❄️" || a.icon === "🌊") ? "경보" : alerts.length ? "주의" : "양호";
  const notes: string[] = [];
  if (!alerts.length) notes.push("특이 경보 없음 — 평상 양식 관리");
  notes.push(`${REGION.name} 주요 양식: ${REGION.aquaSpecies} — 수온·염도 점검`);

  return { statusLabel, waterTemp, waveHeight: wave, weekendRain, alerts, notes };
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
    sun: metrics.tourism.marine?.sun ?? null,
    uv: metrics.uv,
    actions: buildActions(industry, metrics),
    lodging: lodgingBoard(prefs, metrics),
    food: foodBoard(prefs, metrics),
    leisure: leisureBoard(prefs, metrics),
    retail: retailBoard(prefs, metrics),
    fishing: fishingBoard(prefs, metrics),
    salt: saltBoard(prefs, metrics),
    farming: farmingBoard(prefs, metrics),
    travel: travelBoard(prefs, metrics),
    realtor: realtorBoard(prefs, metrics),
    golf: golfBoard(prefs, metrics),
    aqua: aquaBoard(prefs, metrics),
    market: {
      festivals,
      gasoline: metrics.oil?.gasoline?.chungnam ?? null,
      aptAvgManwon: metrics.realestate.apt?.avgManwon ?? null,
      nearbyLodging,
    },
  };
}

export { INDUSTRY_LABEL };
