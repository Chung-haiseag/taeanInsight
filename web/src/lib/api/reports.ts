// 주간 인사이트 리포트 API 클라이언트 — backend/src/reports/router.ts 매핑.
// 서버 컴포넌트에서 직접 호출(localStorage 미사용) — news/[id] 페이지와 동일 패턴.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export type AiLabelKind = "human" | "ai_assisted" | "ai_generated";

export interface ReportSource {
  title: string;
  url?: string;
  publishedAt?: string;
  publisher?: string;
}

export interface ReportSectionView {
  key: string;
  title: string;
  content: string;
  sources: ReportSource[];
  locked: boolean;
  truncated?: boolean;
  emphasis?: "show" | "show_small";
  matched?: boolean;
}

export interface WeeklyReportView {
  weekId: string;
  publishedAt: string;
  aiLabel: AiLabelKind;
  visibilityTier: "critical" | "community" | "personal";
  premiumOnly: boolean;
  summary: string;
  gated: boolean;
  sections: ReportSectionView[];
  personalized?: boolean;
  interests?: string[];
}

export interface ReportListItem {
  weekId: string;
  summary: string;
  publishedAt: string;
  aiLabel: AiLabelKind;
  premiumOnly: boolean;
}

// 최신 발행 리포트(없으면 null). uid로 개인화(등급·관심사 정렬), tier로 수동 게이팅.
export async function fetchLatestReport(tier?: string, uid?: string): Promise<WeeklyReportView | null> {
  const qs = tier ? `?tier=${encodeURIComponent(tier)}` : "";
  try {
    const res = await fetch(`${API_BASE}/api/reports/latest${qs}`, {
      next: { revalidate: 300 },
      headers: uid ? { "X-Taean-Uid": uid } : undefined,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { report: WeeklyReportView | null };
    return data.report ?? null;
  } catch {
    return null;
  }
}

// ── 섹션 시각화용 정형 지표 (backend/src/reports/metrics.ts 매핑) ──
export interface ReportMetrics {
  environment: {
    trend: Array<{ date: string; pm10: number | null; pm25: number | null; temp: number | null; humidity: number | null }>;
    live: { pm10: number | null; pm25: number | null; grade: string | null; temp: number | null; humidity: number | null; sky: string | null; observedAt: string | null } | null;
  };
  realestate: {
    apt: { count: number; avgManwon: number; maxManwon: number; minManwon: number; items: AptItem[] } | null;
    land: { count: number; maxManwon: number; minManwon: number; items: LandItem[] } | null;
  };
  tourism: {
    festivals: Array<{ title: string; start: string; end: string; addr: string }>;
    demand: DemandForecast | null;
    marine: MarineInfo | null;
  };
  trends: WeeklyTrends | null;
  oil: OilPrices | null;
  uv: UVInfo | null;
}
export interface UVInfo { todayMax: number | null; level: string; peakHour: string | null }
export interface TrendItem { cur: number; prev: number; delta: number; goodWhenUp: boolean | null }
export interface WeeklyTrends { pm10?: TrendItem; pm25?: TrendItem; temp?: TrendItem; demand?: TrendItem; interest?: TrendItem }
export interface OilItem { chungnam: number; national: number; vsNational: number; diffDay: number }
export interface OilPrices { date: string; gasoline: OilItem | null; diesel: OilItem | null }
export interface BeachMarine {
  name: string;
  waterTemp: number | null;
  waveHeight: number | null;
  airTemp: number | null;
  wind: number | null;
  beachIndex: string | null;   // 해수욕지수(매우좋음/좋음/보통/나쁨/매우나쁨)
  openStat: string | null;     // 개장/폐장
  observedAt: string | null;
  tides: Array<{ time: string; type: "고조" | "저조"; level: number | null }>;
  source: "기상청" | "해양조사원";
}
export interface TideInfo {
  station: string;
  date: string;
  events: Array<{ time: string; type: "고조" | "저조"; level: number | null }>;
}
export interface SunInfo { sunrise: string; sunset: string }
export interface SurfInfo {
  spot: string;
  noon: string;
  wave: number | null;
  period: number | null;
  wind: number | null;
  waterTemp: number | null;
  levels: Array<{ grade: string; index: string }>;
}
export interface MarineInfo { available: boolean; beaches: BeachMarine[]; tide: TideInfo | null; sun: SunInfo | null; mudflat: string[]; surf: SurfInfo | null }
export interface AptItem { ymd: string; dong: string; name: string; area: string; amount: string; manwon: number; floor: string }
export interface LandItem { ymd: string; dong: string; jimok: string; area: string; amount: string; manwon: number; use: string }
export interface DemandFactor { label: string; effect: number; detail: string }
export interface DemandDayWeather { date: string; tmax: number | null; pop: number | null; sky: string | null; pty: string | null }
export interface DemandForecast {
  available: boolean;
  weekend: { sat: string; sun: string };
  index: number;
  level: "매우높음" | "높음" | "보통" | "낮음" | "매우낮음";
  headline: string;
  factors: DemandFactor[];
  weather: { sat: DemandDayWeather | null; sun: DemandDayWeather | null };
  festivals: Array<{ title: string; start: string; end: string }>;
  holidays: Array<{ date: string; name: string }>;
}

// 다가오는 주말 관광 수요지수(0~100) — 공개. 방문자 첫화면·라이브의 '예측 인사이트' 미끼.
export async function getWeekendDemand(): Promise<DemandForecast | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/demand`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const d = (await res.json()) as DemandForecast;
    return d.available ? d : null;
  } catch { return null; }
}

// 해수욕장 보드 — 해변별 해수욕 적합도 점수·랭킹('이번 주말 어느 해변').
export interface BeachScoreView {
  name: string;
  score: number;
  level: "최고" | "좋음" | "보통" | "주의" | "비추천";
  reasons: string[];
  beachIndex: string | null;
  waveHeight: number | null;
  waterTemp: number | null;
}
export interface BeachBoardView {
  available: boolean;
  updatedAt: string | null;
  top: BeachScoreView | null;
  beaches: BeachScoreView[];
  tide: TideInfo | null;
  sun: SunInfo | null;
}
export async function getBeaches(): Promise<BeachBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/beaches`, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    const d = (await res.json()) as BeachBoardView;
    return d.available ? d : null;
  } catch { return null; }
}

// 갯벌 물때 적기 — 며칠간 조차·낮 간조로 '언제 갯벌 체험이 좋은가'.
export interface MudflatDayView {
  date: string;
  weekday: string;
  range: number | null;
  tideLabel: string;
  daytimeLows: Array<{ time: string; level: number | null }>;
  best: { time: string; level: number | null } | null;
  score: number;
  good: boolean;
}
export interface MudflatBoardView { available: boolean; station: string; days: MudflatDayView[]; best: MudflatDayView | null }

// 태안 농산물 도매 시세 — 마늘·생강·고추 등 전국 도매시장 평균 낙찰가(농업 사장님).
export interface CropPriceView { key: string; name: string; emoji: string; cat: "농산물" | "해조류"; wonPerKg: number | null; prevWonPerKg: number | null; deltaPct: number | null; count: number }
export interface AgriBoardView { available: boolean; date: string | null; prevDate: string | null; crops: CropPriceView[] }

// 태안 축제·행사 캘린더 — 수요 예측의 핵심 동인. 다가오는 축제.
export interface FestivalView {
  key: string; name: string; category: string; area: string;
  from: [number, number]; to: [number, number];
  impact: "대형" | "중형" | "소형"; exact2026?: boolean; nextStart: string;
}
// 기상특보 — 태안(충남) 발효 특보. 안전·급감 신호.
export interface WeatherAlertView {
  active: boolean;
  warnings: Array<{ type: string; level: "경보" | "주의보"; active: boolean }>;
  label: string; penalty: number; issuedAt: string | null;
}
export async function getWeatherAlert(): Promise<WeatherAlertView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/weather-alert`, { next: { revalidate: 600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as WeatherAlertView;
    return d.active ? d : null;
  } catch { return null; }
}

export async function getFestivals(): Promise<FestivalView[]> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/festivals`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const d = (await res.json()) as { festivals?: FestivalView[] };
    return d.festivals ?? [];
  } catch { return []; }
}
export async function getAgriPrices(): Promise<AgriBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/agri`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as AgriBoardView;
    return d.available ? d : null;
  } catch { return null; }
}
// 어패류 소매 시세(KAMIS) — 태안 수산 사장님·주민용. 꽃게·바지락·전복·낙지·꼬막·새우·오징어·갈치.
export interface SeafoodPriceView { code: string; name: string; emoji: string; kind: string; unit: string; price: number; prevPrice: number | null; deltaPct: number | null }
export interface SeafoodBoardView { available: boolean; date: string | null; items: SeafoodPriceView[] }
export async function getSeafood(): Promise<SeafoodBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/seafood`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as SeafoodBoardView;
    return d.available ? d : null;
  } catch { return null; }
}
// 태안 위판장 경매가(경락가) — 사장님이 위판장에서 실제 받는 값(소매가와 짝). 해수부 위판 API.
export interface FishAuctionView { fish: string; status: string; avgPricePerKg: number; totalKg: number; totalAmount: number; count: number }
export interface AuctionBoardView { available: boolean; date: string | null; markets: string[]; totalAmount: number; fish: FishAuctionView[] }
export async function getAuction(): Promise<AuctionBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/auction`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as AuctionBoardView;
    return d.available ? d : null;
  } catch { return null; }
}
// 위판 물량·값 추세 예측 — 최신 위판일 vs 약 1주 전. 어종별 전망(사장님·중매인).
export type AuctionTone = "up" | "down" | "flat";
export interface FishForecastView { fish: string; avgPricePerKg: number; totalKg: number; volPct: number | null; pricePct: number | null; label: string; tone: AuctionTone }
export interface AuctionForecastView { available: boolean; date: string | null; prevDate: string | null; items: FishForecastView[] }
export async function getAuctionForecast(): Promise<AuctionForecastView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/auction-forecast`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as AuctionForecastView;
    return d.available ? d : null;
  } catch { return null; }
}

// 낚시 출조 지수(배낚시) — 신진도·안흥 근해 3일 예보.
export type FishingGrade = "최적" | "좋음" | "보통" | "주의" | "출조자제";
export interface FishingDayView { date: string; weekday: string; score: number; grade: FishingGrade; waveHeight: number | null; windSpeed: number | null; tideRange: number | null; reasons: string[]; species: string[]; highTides: string[]; lowTides: string[] }
export interface FishingBoardView { available: boolean; spot: string; waterTemp: number | null; todaySpecies: string[]; days: FishingDayView[]; best: FishingDayView | null }
export async function getFishing(): Promise<FishingBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/fishing`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const d = (await res.json()) as FishingBoardView;
    return d.available ? d : null;
  } catch { return null; }
}
// 데이터 지도(공개) — 예측·경보·시세 데이터 소스 카탈로그.
export interface DataCatalogItem { key: string; name: string; cat: string; type: string; status: "live" | "progress"; source: string; desc: string }
export async function getDataMap(): Promise<DataCatalogItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/data-map`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const d = (await res.json()) as { sources?: DataCatalogItem[] };
    return d.sources ?? [];
  } catch { return []; }
}

// 낙조(노을) 예보 — 태안 낙조 명소 3일. "오늘 노을 예쁠까".
export type SunsetGrade = "환상적" | "좋음" | "보통" | "흐림" | "기대난망";
export interface SunsetDayView { date: string; weekday: string; sunset: string | null; score: number; grade: SunsetGrade; reasons: string[]; sky: string | null }
export interface SunsetBoardView { available: boolean; spots: string[]; days: SunsetDayView[]; best: SunsetDayView | null }
export async function getSunset(): Promise<SunsetBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/sunset`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const d = (await res.json()) as SunsetBoardView;
    return d.available ? d : null;
  } catch { return null; }
}
// 제철 수산물 최적 타이밍 — 태안 대표 수산물 제철 달력 + 현재 경락가.
export type PeakStatus = "성수기" | "제철임박" | "비성수기";
export interface SeasonalItemView { name: string; emoji: string; status: PeakStatus; peakMonths: number[]; note: string; pricePerKg: number | null }
export interface SeasonalBoardView { available: boolean; month: number; inSeason: SeasonalItemView[]; upcoming: SeasonalItemView[]; all: SeasonalItemView[] }
export async function getSeasonal(): Promise<SeasonalBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/seasonal`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as SeasonalBoardView;
    return d.available ? d : null;
  } catch { return null; }
}
// 해무(바다안개) 예보 — 서해안 해무 위험도 3일(안전).
export type FogGrade = "짙은 해무" | "해무 가능" | "옅은 안개" | "양호";
export interface FogDayView { date: string; weekday: string; score: number; grade: FogGrade; reasons: string[]; reh: number | null; airTemp: number | null }
export interface FogBoardView { available: boolean; waterTemp: number | null; days: FogDayView[]; worst: FogDayView | null }
export async function getFog(): Promise<FogBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/fog`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const d = (await res.json()) as FogBoardView;
    return d.available ? d : null;
  } catch { return null; }
}
// "오늘의 태안" 한 줄 브리핑 — 매일 아침 Web Push로도 발송. 배너 표시용.
export interface TodayBriefView { title: string; body: string }
export async function getTodayBrief(): Promise<TodayBriefView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/today-brief`, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    const d = (await res.json()) as { available?: boolean; title?: string; body?: string };
    return d.available && d.title && d.body ? { title: d.title, body: d.body } : null;
  } catch { return null; }
}

// 꽃·단풍 개화 예측 — 지금 볼 수 있는 꽃 + 다가오는 개화(만개 D-day).
export type BloomStatus = "만개" | "개화중" | "절정지남" | "개화전" | "종료";
export interface BloomItemView { name: string; emoji: string; kind: "꽃" | "단풍" | "억새"; place: string; note: string; status: BloomStatus; daysToPeak: number }
export interface BloomBoardView { available: boolean; month: number; active: BloomItemView[]; upcoming: BloomItemView[] }
export async function getBloom(): Promise<BloomBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/bloom`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as BloomBoardView;
    return d.available ? d : null;
  } catch { return null; }
}

// 양식 수온 경보(고수온·저수온) — 양식 어가 폐사 조기경보. 위험할 때만 노출.
export type AquaLevel = "정상" | "관심" | "주의" | "경보";
export interface AquaBoardView { available: boolean; waterTemp: number | null; level: AquaLevel; label: string | null; note: string | null }
export async function getAqua(): Promise<AquaBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/aqua`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const d = (await res.json()) as AquaBoardView;
    return d.available ? d : null;
  } catch { return null; }
}

// 산불위험 지수 — 건조기 안전. 위험할 때만 노출.
export type FireLevel = "낮음" | "보통" | "높음" | "매우높음";
export interface FireBoardView { available: boolean; score: number; level: FireLevel; reasons: string[] }
export async function getFireRisk(): Promise<FireBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/fire-risk`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const d = (await res.json()) as FireBoardView;
    return d.available ? d : null;
  } catch { return null; }
}
// 영농 경보 — 서리·한파·폭염 + 이번 달 농사 적기.
export interface FarmAlertView { kind: "서리" | "한파" | "폭염"; text: string }
export interface FarmTaskView { crop: string; emoji: string; task: "파종 적기" | "수확 적기" }
export interface FarmBoardView { available: boolean; month: number; alerts: FarmAlertView[]; tasks: FarmTaskView[] }
export async function getFarm(): Promise<FarmBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/farm`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const d = (await res.json()) as FarmBoardView;
    return d.available ? d : null;
  } catch { return null; }
}

// 미세먼지 예보 — 충남(태안) PM10·PM2.5 오늘~모레 등급.
export interface DustDayView { date: string; pm10: string | null; pm25: string | null; overall: string | null }
export interface DustBoardView { available: boolean; city: string; days: DustDayView[] }
export async function getDust(): Promise<DustBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/dust`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as DustBoardView;
    return d.available ? d : null;
  } catch { return null; }
}
export async function getMudflat(): Promise<MudflatBoardView | null> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/mudflat`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as MudflatBoardView;
    return d.available ? d : null;
  } catch { return null; }
}

// 섹션별 차트·표·카드용 수치(실패 시 null) — 산문과 독립적으로 항상 최신값
export async function fetchReportMetrics(): Promise<ReportMetrics | null> {
  try {
    const res = await fetch(`${API_BASE}/api/reports/metrics`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { metrics: ReportMetrics | null };
    return data.metrics ?? null;
  } catch {
    return null;
  }
}

export interface GovNoticeItem {
  board_name: string;
  title: string;
  dept?: string;
  published_at: string;
  url?: string;
  image_url?: string;
  images?: string[];
}

// 태안군청 군정 소식(공지·새소식·주간행사계획) — 원문 taean.go.kr 링크 포함
export async function fetchGovNotices(limit = 12): Promise<GovNoticeItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/gov/recent?limit=${limit}`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { notices: GovNoticeItem[] };
    return data.notices ?? [];
  } catch {
    return [];
  }
}

// 태안군청 카드뉴스(이미지) — 원문 링크 + 대표 이미지
export async function fetchCardNews(limit = 6): Promise<GovNoticeItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/gov/recent?board=${encodeURIComponent("카드뉴스")}&limit=${limit}`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { notices: GovNoticeItem[] };
    return (data.notices ?? []).filter((n) => n.image_url);
  } catch {
    return [];
  }
}

export interface WeeklyNewsItem {
  idxno: number;
  title: string;
  publishedAt: string;
  category?: string;
  section?: string;
}

// 리포트 주차의 태안신문 주요 뉴스(아카이브 링크)
export async function fetchWeeklyNews(weekId: string): Promise<WeeklyNewsItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/reports/${encodeURIComponent(weekId)}/news`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { news: WeeklyNewsItem[] };
    return data.news ?? [];
  } catch {
    return [];
  }
}

// "N년 전 오늘 태안" — 아카이브 회고(같은 MM-DD 과거 기사)
export interface OnThisDayItem { idxno: number; title: string; year: number; yearsAgo: number; category?: string; leadImage?: string | null; date?: string }
export async function fetchOnThisDay(limit = 30): Promise<OnThisDayItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/archive/on-this-day?limit=${limit}`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { items: OnThisDayItem[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

// 태안군TV(유튜브 채널) 최신 영상 — 백엔드가 RSS 패스스루(서버 저장 없음)
export interface TvNewsVideo { id: string; title: string; url: string; thumbnail: string; publishedAt: string; description: string }
export async function fetchTvNews(limit = 3): Promise<TvNewsVideo[]> {
  try {
    const res = await fetch(`${API_BASE}/api/news/tv`, { next: { revalidate: 900 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { items: TvNewsVideo[] };
    return (data.items ?? []).slice(0, limit);
  } catch {
    return [];
  }
}

// 도로 실시간 CCTV(ITS, D1 미러) — 태안 국도 카메라(HLS)
export interface CctvCamera { name: string; url: string; lat: number; lon: number; road: string }
export async function fetchCctv(): Promise<{ available: boolean; cameras: CctvCamera[]; updatedAt: string | null }> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/cctv`, { next: { revalidate: 300 } });
    if (!res.ok) return { available: false, cameras: [], updatedAt: null };
    return (await res.json()) as { available: boolean; cameras: CctvCamera[]; updatedAt: string | null };
  } catch {
    return { available: false, cameras: [], updatedAt: null };
  }
}

// 해무 CCTV 스틸컷(국립해양조사원) — 태안 인근 관측소(대산항·평택당진항) 최신 이미지
export interface SeafogStill { station: string; imgDt: string; url: string }
export async function fetchSeafog(): Promise<{ available: boolean; stills: SeafogStill[] }> {
  try {
    const res = await fetch(`${API_BASE}/api/conditions/seafog`, { next: { revalidate: 300 } });
    if (!res.ok) return { available: false, stills: [] };
    return (await res.json()) as { available: boolean; stills: SeafogStill[] };
  } catch {
    return { available: false, stills: [] };
  }
}

// B2B 대시보드 시계열(지역 데이터 분석)
export interface DashEnvPoint { date: string; pm10: number | null; pm25: number | null; o3: number | null; temp: number | null; humidity: number | null }
export interface DashDemandPoint { date: string; idx: number | null; level: string | null }
export async function fetchDashboardSeries(days = 30): Promise<{ days: number; environment: DashEnvPoint[]; demand: DashDemandPoint[] }> {
  try {
    const res = await fetch(`${API_BASE}/api/dashboard/series?days=${days}`, { next: { revalidate: 300 } });
    if (!res.ok) return { days, environment: [], demand: [] };
    return (await res.json()) as { days: number; environment: DashEnvPoint[]; demand: DashDemandPoint[] };
  } catch {
    return { days, environment: [], demand: [] };
  }
}
export const dashboardCsvUrl = (dataset: "environment" | "demand", days: number) =>
  `${API_BASE}/api/dashboard/export?dataset=${dataset}&days=${days}`;

// 발행분 목록(최신순).
export async function listReports(): Promise<ReportListItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/reports`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { reports: ReportListItem[] };
    return data.reports ?? [];
  } catch {
    return [];
  }
}

// 주간 팟캐스트 다시듣기 — 팟캐스트(-gem)가 있는 발행 회차 목록.
export interface PodcastEpisode {
  weekId: string;
  publishedAt: string;
  summary: string;
}
export async function listPodcastEpisodes(): Promise<PodcastEpisode[]> {
  try {
    const res = await fetch(`${API_BASE}/api/audio/podcast/episodes`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { episodes: PodcastEpisode[] };
    return data.episodes ?? [];
  } catch {
    return [];
  }
}
