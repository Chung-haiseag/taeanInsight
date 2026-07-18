// AI Query Agent API — 자연어 질의 → LangGraph Lite(라우터→예측/생성)→ 출처 표기 응답
// PRD v1.8 §6 REQ-AI-001 / REQ-PRODUCT-002 / TaskMaster #23
//
// LLM 경로: Workers AI 무료 오픈모델(종량 0, 시크릿 불필요).
//   기존 HybridLlmRouter에 WorkersAiLlmClient를 batch·realtime 양쪽으로 꽂아
//   라우터 노드·캐시·비용기록·서킷 브레이커를 그대로 재사용.
// 캐시는 인메모리(아이솔레이트 수명) — 영속 캐시는 KV 도입 시 교체(아래 NOTE).

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import { createAgentRuntime } from "../agents";
import { InMemoryCacheStore } from "../cache/key_normalizer";
import { CircuitBreaker, InMemoryMonthlyQuery } from "../cost/circuit_breaker";
import { DefaultCostRecorder, InMemoryCostStore } from "../cost/recorder";
import { HybridLlmRouter } from "../llm/hybrid_router";
import { WorkersAiLlmClient } from "../llm/workers_ai";
import { fetchConditions } from "../env/sources";
import { fetchRealEstateDeep } from "../env/realestate";
import { fetchTour } from "../env/tour";
import { forecastDemand } from "../tour/demand";
import { loadMarine } from "../tour/marine";
import { fetchMidForecast } from "../env/midforecast";
import { REGION } from "../region";
import { completeAvoidingGarble } from "./answer_quality";
import { extractKeywords, ftsRankTokens, QUERY_STOP, UBIQUITOUS } from "./keywords";

// 날씨·대기질 관련 질문인지 — 그러면 실시간 관측값을 근거로 추가
const WEATHER_RE = /날씨|기상|예보|기온|온도|미세먼지|초미세|대기질|미세|오존|황사|습도|비\b|강수|맑음|흐림|공기|먼지|폭염|한파|태풍|장마/;
// 부동산·실거래 질문이면 국토부 실거래가를 근거로 추가
const REALESTATE_RE = /부동산|토지|시세|실거래|아파트|땅값|평당|매매|전세|임대|분양|집값/;
// 관광 수요·축제·행사 질문이면 수요예측+축제를 근거로 추가
const TOURISM_RE = /관광|수요|축제|행사|방문객|관광객|피서|성수기|혼잡|여행객|놀러|나들이|붐비/;
// 바다·해변 질문이면 일출몰·물때·수온·파고·해수욕지수·서핑을 근거로 추가
const MARINE_RE = /일몰|일출|해넘이|해돋이|노을|물때|밀물|썰물|만조|간조|조석|수온|파고|물높이|해수욕|갯벌|서핑|바다|해변|해안|선셋/;
// 행사·일정·군정 질문이면 태안군청 군정소식·주간행사계획을 근거로 추가
const EVENT_RE = /행사|일정|이벤트|공지|군정|군청|새소식|소식|주간|개최|열리|열린/;
// 추천·"오늘 뭐하지"류 → 오늘의 날씨·바다·행사·수요를 종합해 추천
const RECOMMEND_RE = /뭐\s?하|뭘\s?하|무엇.*하면|할\s?만한|할\s?게|가\s?볼\s?만한|가볼만|추천|나들이|놀러|구경|데이트|코스|어디.*(갈|가면|놀|좋)|뭐\s?먹|볼거리|즐길/;
// "우리 가게" 1인칭 사업 질문 → 사용자 shopProfile 보드 주입
const MYSHOP_RE = /우리|저희|내\s?가게|장사|매출|예약|손님|가동률|영업|성수기|폐장|우리\s?(모텔|호텔|펜션|식당|카페|가게|골프장|여행사|배|농장)/;
// 지역 용어(설정 파생) / 타지역 용어 — 타지역만 언급되면 실시간 데이터 주입을 막아 오표기 방지
const AREA_RE = new RegExp(REGION.areaTerms.map((t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
const OTHER_REGION_RE = /서울|부산|대구|인천|광주|대전|울산|세종|경기|수원|성남|용인|강원|춘천|강릉|속초|청주|충북|천안|아산|당진|서산|보령|예산|홍성|청양|전주|전북|전남|여수|순천|목포|경북|포항|경주|안동|경남|창원|진주|통영|거제|제주|서귀포|강남|강북|홍대|명동|이태원|잠실|분당|일산/;

// owner-brief 보드 → AI 근거 텍스트(본인 가게 수치)
function buildShopEvidence(b: import("../owner/brief").OwnerBrief): string | null {
  const won = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n / 10000)}만원`);
  const L: string[] = [];
  const wk = b.lodging?.weekend ?? b.food?.weekend ?? b.leisure?.weekend ?? b.retail?.weekend ?? b.travel?.weekend ?? b.golf?.weekend;
  if (wk) L.push(`이번 주말(${wk.sat}~${wk.sun})`);
  if (b.lodging) L.push(`숙박: 예상 가동률 ${b.lodging.occRate}%, 권장 주말요금 ${won(b.lodging.recommendedPrice)}, 예상 1박 매출 ${won(b.lodging.estRevenue)} (수요 '${b.lodging.level}')`);
  if (b.food) L.push(`${b.food.kind === "cafe" ? "카페" : "식당"}: 예상 혼잡 '${b.food.busyLabel}', 예상 손님 ${b.food.expectedCovers ?? "—"}명, 예상 매출 ${won(b.food.estRevenue)}`);
  if (b.leisure) L.push(`레저: 야외활동 적합도 '${b.leisure.fitLabel}', 예상 참가 ${b.leisure.expectedGuests ?? "—"}명, 예상 매출 ${won(b.leisure.estRevenue)}`);
  if (b.retail) L.push(`소매: 예상 혼잡 '${b.retail.busyLabel}', 예상 방문 ${b.retail.expectedVisitors ?? "—"}명, 예상 매출 ${won(b.retail.estRevenue)}`);
  if (b.travel) L.push(`여행사: 투어 적합도 '${b.travel.fitLabel}', 예상 예약 ${b.travel.expectedBookings ?? "—"}명, 예상 매출 ${won(b.travel.estRevenue)}`);
  if (b.golf) L.push(`골프장: 라운딩 적합도 '${b.golf.fitLabel}', 예상 내장 ${b.golf.expectedRounds ?? "—"}명, 예상 매출 ${won(b.golf.estRevenue)}`);
  if (b.fishing) L.push(`낚시·수산: 오늘 출항 '${b.fishing.goLabel}'(파고 ${b.fishing.waveHeight?.toFixed(1) ?? "?"}m·풍속 ${b.fishing.windSpeed?.toFixed(0) ?? "?"}m/s), 수온 ${b.fishing.waterTemp ?? "?"}℃, 다음 ${b.fishing.nextTide ? `${b.fishing.nextTide.type} ${b.fishing.nextTide.time}` : "물때 정보 없음"}`);
  if (b.salt) L.push(`염전: 오늘 채염 적합도 '${b.salt.harvestLabel}'(하늘 ${b.salt.sky ?? "?"})`);
  if (b.farming) L.push(`농업: 영농 여건 '${b.farming.statusLabel}'${b.farming.alerts.length ? `, 경보: ${b.farming.alerts.map((a) => a.text).join("; ")}` : ""}`);
  if (b.aqua) L.push(`양식·수산: 여건 '${b.aqua.statusLabel}', 수온 ${b.aqua.waterTemp ?? "?"}℃, 파고 ${b.aqua.waveHeight?.toFixed(1) ?? "?"}m${b.aqua.alerts.length ? `, 경보: ${b.aqua.alerts.map((a) => a.text).join("; ")}` : ""}`);
  if (b.realtor) L.push(`부동산: 최근 아파트 거래 ${b.realtor.aptCount}건, 평균 ${b.realtor.aptAvgManwon ? `${(b.realtor.aptAvgManwon / 10000).toFixed(1)}억` : "—"}, ㎡당 ${b.realtor.aptPerM2Manwon ?? "—"}만원`);
  // 실행 제안 상위 3
  if (b.actions.length) L.push(`추천 조치: ${b.actions.slice(0, 3).map((a) => a.text).join(" / ")}`);
  return L.length > 1 ? `[내 가게 맞춤 분석]\n${L.join("\n")}` : null;
}
// YYYYMMDD → 오늘 기준 D-day(KST)
function ymd8Dday(s: string): number {
  if (!/^\d{8}$/.test(s)) return 9999;
  const target = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return Math.round((target - Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate())) / 86400000);
}
// 순수 날씨 질문 판별 — 날씨 용어·지명·시간어 외에 다른 내용 키워드가 없으면 true(기사 출처 생략)
const PLACE_TIME = new Set(["태안", "태안군", "안면도", "안면", "오늘", "지금", "현재", "요즘", "내일", "오전", "오후", "이번", "어때", "어떄", "정도", "수준", "농도", "상태"]);
function isPureWeather(query: string): boolean {
  if (!WEATHER_RE.test(query)) return false;
  const extra = query
    .replace(/[^가-힣0-9a-zA-Z]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !WEATHER_RE.test(t) && !PLACE_TIME.has(t) && !QUERY_STOP.has(t));
  return extra.length === 0;
}

export const queryRouter = new Hono<{ Bindings: Env }>();

// 질문에서 핵심 키워드 추출 → 아카이브(FTS5 우선, LIKE 폴백)에서 근거 기사 검색.
// 키워드 정규화(조사 제거·지역어 희석 제거)는 keywords.ts 참고.
async function retrieveArchive(
  db: D1Database,
  query: string,
): Promise<Array<{ idxno: number; title: string; published_at: string; body: string }>> {
  const tokens = extractKeywords(query);
  if (!tokens.length) return [];
  const cols = "a.idxno, a.title, a.published_at, substr(a.body,1,1300) AS body";
  // FTS5(트라이그램)는 3글자 이상만 매칭 — ubiquitous 지역어(태안/태안군)는 순위 희석되어 제외.
  const ftsTokens = ftsRankTokens(tokens).map((t) => `"${t.replace(/"/g, "")}"`);
  if (ftsTokens.length) {
    try {
      const r = await db
        .prepare(
          `SELECT ${cols} FROM archive_fts f JOIN archive_articles a ON a.idxno=f.rowid ` +
            `WHERE archive_fts MATCH ? ORDER BY bm25(archive_fts) LIMIT 5`, // 관련도순(최신순 아님)
        )
        .bind(ftsTokens.join(" OR "))
        .all<{ idxno: number; title: string; published_at: string; body: string }>();
      if (r.results?.length) return r.results;
    } catch { /* LIKE 폴백 */ }
  }
  // LIKE 폴백 — ubiquitous 지역어를 뺀 가장 긴 토큰 우선(지역명만 남으면 그거라도).
  const likePool = tokens.filter((t) => !UBIQUITOUS.has(t));
  const kw = `%${(likePool.length ? likePool : tokens).sort((a, b) => b.length - a.length)[0]}%`;
  const r = await db
    .prepare(
      `SELECT ${cols} FROM archive_articles a WHERE a.title LIKE ?1 OR a.body LIKE ?1 ` +
        `ORDER BY a.published_at DESC LIMIT 6`,
    )
    .bind(kw)
    .all<{ idxno: number; title: string; published_at: string; body: string }>();
  return r.results ?? [];
}

// 아이솔레이트 단위 공유 캐시 — 동일 워커 인스턴스 내 반복 질의 히트
const sharedCache = new InMemoryCacheStore();

const querySchema = z.object({
  query: z.string().min(2).max(500),
  domain: z.enum(["tourism", "environment", "realestate", "general"]).optional(),
  location: z.string().max(40).optional(),
  userTier: z.enum(["anon", "b2c", "b2b", "b2g"]).optional(),
});

queryRouter.post("/", async (c) => {
  if (!c.env.AI) {
    return c.json({ error: "ai_unbound", message: "Workers AI 바인딩이 없습니다" }, 503);
  }

  const parsed = querySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  }
  const { query, domain, location, userTier } = parsed.data;

  // ── ① RAG: 실시간 관측(날씨·대기질) + 태안뉴스·아카이브를 근거로 답변(출처 표기) ──
  const client = new WorkersAiLlmClient({ ai: c.env.AI });
  try {
    const parts: Array<{ text: string; source: { title: string; url: string | null; publishedAt?: string } }> = [];
    const recommend = RECOMMEND_RE.test(query); // 추천 질문 → 오늘 날씨·바다·행사·수요 종합
    // 타지역만 언급(태안 용어 없음) → 태안 실시간 데이터 주입 차단(강남 날씨에 태안값 오표기 방지)
    const offRegion = OTHER_REGION_RE.test(query) && !AREA_RE.test(query);
    if (offRegion) {
      parts.push({ text: "이 서비스는 충청남도 태안군 지역 정보만 제공합니다. 태안 외 지역의 날씨·시세·관광 데이터는 보유하지 않습니다.", source: { title: "안내 · 태안 전용 서비스", url: null } });
    }

    // (a-0) 내 가게 맞춤 — 로그인(익명 uid)에 가게 정보가 있고 사업/주말/추천 질문이면 본인 업종 보드 주입
    let hasMyShop = false;
    const uid = c.req.header("X-Taean-Uid");
    if (uid && c.env.ARCHIVE_DB && (MYSHOP_RE.test(query) || recommend || /주말|예보|이번\s?주|다음\s?주/.test(query))) {
      try {
        const { D1PreferencesRepo } = await import("../preferences/repository_d1");
        const prefs = await new D1PreferencesRepo(c.env.ARCHIVE_DB).get(uid);
        if (prefs?.shopProfile) {
          const { loadOwnerBrief } = await import("../owner/brief");
          const text = buildShopEvidence(await loadOwnerBrief(c.env, prefs));
          if (text) { parts.push({ text, source: { title: "내 가게 맞춤 분석(태안 수요·날씨 기반)", url: null } }); hasMyShop = true; }
        }
      } catch { /* 가게 분석 실패는 무시 */ }
    }

    // (a) 날씨·대기질 질문이면 실시간 관측값을 근거에 추가
    if ((WEATHER_RE.test(query) || recommend) && c.env.DATA_GO_KR_KEY && !offRegion) {
      const cond = await fetchConditions(c.env);
      if (cond.available && (cond.weather.temp != null || cond.air.pm10 != null || cond.air.grade)) {
        const w = cond.weather, a = cond.air;
        const text =
          `태안 실시간 관측(${String(cond.observedAt).slice(0, 16).replace("T", " ")} KST) — ` +
          `기온 ${w.temp ?? "?"}℃, 습도 ${w.humidity ?? "?"}%, 하늘 ${w.sky ?? "?"}, 강수 ${w.pty ?? "?"}; ` +
          `미세먼지(PM10) ${a.pm10 ?? "?"}㎍/㎥, 초미세(PM2.5) ${a.pm25 ?? "?"}㎍/㎥, 오존 ${a.o3 ?? "?"}ppm, ` +
          `통합대기 '${a.grade ?? "?"}' (측정소 ${a.station ?? "?"})`;
        parts.push({ text, source: { title: "실시간 관측 · 기상청 단기예보 / 에어코리아", url: null, publishedAt: cond.observedAt ?? undefined } });
      }
      // 예보·주말·내일 질문이면 주말/다가오는 날 예보 — 단기(±3일) 우선, 범위 밖이면 중기(3~10일)
      if (/예보|주말|다음\s?주|내일|모레|이번\s?주/.test(query)) {
        try {
          const [dem, mid] = await Promise.all([forecastDemand(c.env), fetchMidForecast(c.env)]);
          const shortFc = (w: { tmax: number | null; pop: number | null; sky: string | null; pty: string | null } | null) => {
            if (!w) return null;
            const p: string[] = [];
            if (w.tmax != null) p.push(`최고 ${w.tmax}℃`);
            if (w.pop != null) p.push(`강수확률 ${w.pop}%`);
            if (w.sky) p.push(`하늘 ${w.sky}`);
            if (w.pty && w.pty !== "없음") p.push(w.pty);
            return p.length ? `${p.join(", ")} (단기예보)` : null;
          };
          const midFc = (date: string) => {
            const m = mid.available ? mid.days[date] : null;
            if (!m) return null;
            const p: string[] = [];
            if (m.tmax != null) p.push(`최고 ${m.tmax}℃`);
            if (m.tmin != null) p.push(`최저 ${m.tmin}℃`);
            if (m.pop != null) p.push(`강수확률 ${m.pop}%`);
            if (m.sky) p.push(m.sky);
            return p.length ? `${p.join(", ")} (중기예보)` : null;
          };
          const wk = dem?.weekend;
          type SW = { tmax: number | null; pop: number | null; sky: string | null; pty: string | null } | null | undefined;
          const dayLine = (label: string, date: string | undefined, sw: SW) => {
            if (!date) return null;
            const s = shortFc(sw ?? null) ?? midFc(date);
            return s ? `${label}(${date.slice(5)}) ${s}` : null;
          };
          const sat = dayLine("토", wk?.sat, dem?.weather?.sat);
          const sun = dayLine("일", wk?.sun, dem?.weather?.sun);
          if (sat || sun) {
            parts.push({ text: `태안 주말 기상예보 — ${[sat, sun].filter(Boolean).join(" / ")}`, source: { title: "기상청 단기·중기예보", url: null } });
          }
        } catch { /* 무시 */ }
      }
    }

    // (a-2) 부동산·실거래 질문이면 국토부 실거래가를 근거에 추가(읍·면 필터 + ㎡당 단가·월별 추이·전체 대비)
    if (REALESTATE_RE.test(query) && c.env.DATA_GO_KR_KEY && !offRegion) {
      const re = await fetchRealEstateDeep(c.env);
      if (re.available && (re.apartments.length || re.lands.length)) {
        const EUPMYEON = ["태안읍", "안면읍", "고남면", "근흥면", "남면", "소원면", "원북면", "이원면"];
        const hay = `${query} ${location ?? ""}`;
        const eup = EUPMYEON.find((e) => hay.includes(e)) ?? (/안면도/.test(hay) ? "안면읍" : null);
        const inEup = (d: string) => !eup || (d ?? "").includes(eup);
        const scope = eup ?? "태안군";

        // 토지/아파트 표본 통계 — ㎡당 단가(만원), 건수, 기간, 월별 추이
        type Item = { manwon: number; area: string; ymd: string };
        const stat = (items: Item[]) => {
          const v = items.filter((x) => x.manwon > 0 && Number(x.area) > 0);
          if (!v.length) return null;
          const unit = v.map((x) => x.manwon / Number(x.area)); // 만원/㎡
          const avgU = unit.reduce((s, u) => s + u, 0) / unit.length;
          const ymds = v.map((x) => x.ymd).filter(Boolean).sort();
          // 월별 평균 ㎡단가
          const byMon = new Map<string, number[]>();
          for (const x of v) { const m = x.ymd.slice(0, 7); const a = byMon.get(m) ?? []; a.push(x.manwon / Number(x.area)); byMon.set(m, a); }
          const monthly = [...byMon.entries()].sort().map(([m, us]) => `${m}: ㎡당 ${(us.reduce((s, u) => s + u, 0) / us.length).toFixed(1)}만원(${us.length}건)`).join(", ");
          return { n: v.length, avgU: avgU.toFixed(1), minU: Math.min(...unit).toFixed(1), maxU: Math.max(...unit).toFixed(1), from: ymds[0], to: ymds[ymds.length - 1], monthly };
        };

        const landsLoc = re.lands.filter((x) => inEup(x.dong));
        const aptsLoc = re.apartments.filter((x) => inEup(x.dong));
        const landStat = stat(landsLoc), aptStat = stat(aptsLoc);
        const countyLand = stat(re.lands), countyApt = stat(re.apartments);

        const lines: string[] = [`[${scope} 부동산 실거래 분석 · 국토교통부 최근 6개월]`];
        if (landStat) {
          lines.push(`· 토지: ${landStat.n}건(${landStat.from}~${landStat.to}), ㎡당 평균 ${landStat.avgU}만원(범위 ${landStat.minU}~${landStat.maxU}). 월별 추이 — ${landStat.monthly}`);
          lines.push(`  개별: ${landsLoc.slice(0, 8).map((x) => `${x.dong} ${x.jimok} ${x.area}㎡ ${x.amount}(${x.ymd})`).join("; ")}`);
        }
        if (aptStat) {
          lines.push(`· 아파트: ${aptStat.n}건, ㎡당 평균 ${aptStat.avgU}만원. 월별 — ${aptStat.monthly}`);
          lines.push(`  개별: ${aptsLoc.slice(0, 6).map((x) => `${x.dong} ${x.name} ${x.area}㎡ ${x.amount}(${x.ymd})`).join("; ")}`);
        }
        if (eup && !landStat && !aptStat) {
          lines.push(`· ${eup}의 최근 6개월 실거래 기록이 없습니다.`);
        }
        // 태안군 전체 대비(읍면 질문일 때 비교 기준). 읍·면 표본이 적으면 전체 월별 추이까지 제공.
        if (eup && countyLand) {
          const sparse = (landStat?.n ?? 0) < 3;
          lines.push(`· (참고) 태안군 전체 토지 ㎡당 평균 ${countyLand.avgU}만원(${countyLand.n}건, ${countyLand.from}~${countyLand.to})${countyApt ? `, 아파트 ㎡당 평균 ${countyApt.avgU}만원` : ""}`);
          if (sparse) lines.push(`  ${eup} 표본이 적어 추세 단정이 어렵습니다. 태안군 전체 토지 월별 추이 — ${countyLand.monthly}`);
        }

        parts.push({ text: lines.join("\n"), source: { title: `국토교통부 실거래가 · ${scope}(6개월)`, url: null } });
      }
    }

    // (a-3) 관광 수요·축제 질문이면 수요예측 + 축제 일정을 근거에 추가
    if ((TOURISM_RE.test(query) || recommend) && !offRegion) {
      const lines: string[] = [];
      try {
        const t = await fetchTour(c.env);
        const fests = (t.festivals ?? [])
          .map((f) => ({ ...f, dday: ymd8Dday(f.start) }))
          .filter((f) => f.dday >= -3)
          .sort((a, b) => a.dday - b.dday)
          .slice(0, 8);
        if (fests.length) {
          lines.push("축제·행사: " + fests.map((f) => `${f.title}(${f.start}~${f.end}${f.dday >= 0 && f.dday <= 60 ? `, D-${f.dday}` : ""}${f.addr ? `, ${f.addr}` : ""})`).join("; "));
        }
      } catch { /* 무시 */ }
      if (c.env.DATA_GO_KR_KEY) {
        try {
          const dem = await forecastDemand(c.env);
          if (dem?.available) {
            const fac = (dem.factors ?? []).map((f) => `${f.label} ${f.effect > 0 ? "+" : ""}${f.effect}(${f.detail})`).join(", ");
            lines.push(`주말 관광 수요지수: ${dem.index}점 '${dem.level}' (${dem.weekend.sat}~${dem.weekend.sun}). ${dem.headline}. 기여 요인 — ${fac}`);
          }
        } catch { /* 무시 */ }
      }
      if (lines.length) parts.push({ text: `[태안 관광 수요·행사]\n${lines.join("\n")}`, source: { title: "관광 수요예측·축제(TourAPI·기상 기반)", url: null } });
    }

    // (a-4) 바다·해변 질문이면 일출몰·물때·수온·파고·서핑을 근거에 추가(실시간/천문계산)
    if ((MARINE_RE.test(query) || recommend) && c.env.DATA_GO_KR_KEY && !offRegion) {
      try {
        const m = await loadMarine(c.env);
        if (m.available) {
          const seg: string[] = [];
          if (m.sun) seg.push(`오늘 일출 ${m.sun.sunrise}, 일몰 ${m.sun.sunset} (태안 기준 천문계산)`);
          if (m.tide?.events?.length) seg.push(`오늘 물때(${m.tide.station}): ${m.tide.events.map((e) => `${e.type === "고조" ? "만조" : "간조"} ${e.time}`).join(", ")}`);
          if (m.beaches?.length) seg.push(`해변: ${m.beaches.map((b) => `${b.name} 수온 ${b.waterTemp ?? "?"}℃·파고 ${b.waveHeight ?? "?"}m${b.beachIndex ? `·해수욕지수 ${b.beachIndex}` : ""}`).join("; ")}`);
          if (m.surf) seg.push(`서핑(${m.surf.spot}): 파고 ${m.surf.wave ?? "?"}m·수온 ${m.surf.waterTemp ?? "?"}℃`);
          if (m.mudflat?.length) seg.push(`갯벌체험 적기: ${m.mudflat.join(", ")}`);
          if (seg.length) parts.push({ text: `[태안 바다·해변 실시간]\n${seg.join("\n")}`, source: { title: "국립해양조사원·일출몰 천문계산(실시간)", url: null } });
        }
      } catch { /* 무시 */ }
    }

    // (a-5) 행사·일정·군정 질문이면 태안군청 군정소식·주간행사계획 주입(이번 주 행사의 정본)
    if ((EVENT_RE.test(query) || recommend) && c.env.ARCHIVE_DB && !offRegion) {
      try {
        const r = await c.env.ARCHIVE_DB
          .prepare(
            `SELECT board_name, title, dept, published_at, substr(body,1,2200) AS body FROM gov_notices
             ORDER BY (board_name='주간행사계획') DESC, published_at DESC, ntt_id DESC LIMIT 10`,
          )
          .all<{ board_name: string; title: string; dept: string | null; published_at: string; body: string | null }>();
        const rows = r.results ?? [];
        if (rows.length) {
          const text = "[태안군청 군정 소식·주간행사계획]\n" + rows.map((n) => {
            const head = `· [${n.board_name}] ${n.title} (${String(n.published_at).slice(0, 10)}${n.dept ? `, ${n.dept}` : ""})`;
            // 주간행사계획은 본문에 실제 일정이 있어 함께 제공
            return n.board_name === "주간행사계획" && n.body ? `${head}\n  ${n.body.replace(/\s+/g, " ").trim()}` : head;
          }).join("\n");
          parts.push({ text, source: { title: "태안군청 군정 소식·주간행사계획", url: null } });
        }
      } catch { /* 무시 */ }
    }

    // (b) 아카이브·태안뉴스 근거 검색 — 단, 순수 날씨 질문이면 기사 출처는 생략
    if (c.env.ARCHIVE_DB && !isPureWeather(query) && !recommend && !hasMyShop) {
      const rows = await retrieveArchive(c.env.ARCHIVE_DB, query);
      for (const r of rows) {
        parts.push({ text: `${r.title} (${String(r.published_at).slice(0, 10)})\n${r.body}`, source: { title: r.title, url: `/news/${r.idxno}`, publishedAt: r.published_at } });
      }
    }

    if (parts.length) {
      const context = parts.map((p, i) => `[${i + 1}] ${p.text}`).join("\n\n");
      // 무료 fp8 모델이 간헐적으로 토큰 붕괴(salad)를 뱉으므로, 붕괴 감지 시 1회 재시도.
      const res = await completeAvoidingGarble(client, {
        channel: "realtime",
        maxTokens: 800,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "너는 태안 지역정보 도우미다. 아래 [근거](실시간 관측값·국토부 실거래·관광 수요·축제·태안신문 기사)를 근거로 한국어로 충실히 답하라.\n" +
              "- 근거의 수치를 최대한 활용해 구체적이고 충분한 분량(3~6문장)으로 답하라. 한 줄로 끝내지 마라.\n" +
              "- 부동산 질문이면 ㎡당 평균 단가·거래 건수·기간·월별 추이·태안군 전체 대비를 종합해 '시세 흐름'을 설명하라.\n" +
              "- 표본이 적으면 '거래가 N건으로 적어 추세 단정은 어렵다'처럼 한계를 함께 밝히되, 있는 데이터는 모두 활용하라.\n" +
              "- 실시간 관측값이 있으면 그 수치를 우선 사용하라.\n" +
              "- 근거가 질문과 '완전히' 무관할 때만 '해당 정보를 찾지 못했습니다'라고 하라.\n" +
              "- 근거에 없는 사실을 지어내지 마라. 답변 끝에 사용한 출처를 [번호]로 표기하라.\n" +
              "- '[근거]', '근거를 토대로', '제공된 정보' 같은 표현을 쓰지 말고 바로 본문 내용으로 자연스럽게 답하라.\n" +
              "- '이번 주/다음 주' 행사는 군청 주간행사계획·축제 일정을 우선 사용하고, 이미 끝난 과거 행사는 답에 넣지 마라.\n" +
              "- '오늘 뭐하지/추천' 류 질문이면 오늘의 날씨·바다(물때·일출몰)·진행 중 축제·행사를 종합해 구체적인 활동을 추천하라(예: 맑고 낮 간조면 갯벌체험, 비 예보면 실내). 과거 기사로 답하지 마라.\n" +
              "- '[내 가게 맞춤 분석]' 근거가 있으면 그 사장님 본인 가게 데이터다. '우리 가게/모텔/식당' 질문엔 그 수치(가동률·예상 손님·권장가·매출·출항 가부 등)로 사장님에게 말하듯 구체적으로 답하고, 실행 조치도 1~2개 제안하라.",
          },
          { role: "user", content: `[근거]\n${context}\n\n[질문] ${query}` },
        ],
      });
      // 출처는 답변이 실제로 사용한 것만 노출(무관 기사 더미 방지).
      const answer = res.content;
      const notFound = /찾지 못했|찾을 수 없|정보가 없|정보를 찾지|확인되지 않/.test(answer);
      const liveParts = parts.filter((p) => p.source.url === null); // 주입한 공식 실시간·집계 근거
      const liveSrc = liveParts.map((p) => p.source);
      const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
      let sources: typeof liveSrc;
      if (notFound) {
        sources = liveSrc; // 못 찾음 → 공식 근거만(무관 기사 제거)
      } else if (liveParts.length) {
        // 주입한 공식 근거는 항상 표시(모델 인용 누락 대비) + 인용된 아카이브 기사만 추가
        const citedArchive = parts.filter((p, i) => cited.has(i + 1) && p.source.url).map((p) => p.source);
        sources = [...liveSrc, ...citedArchive];
      } else {
        // 순수 아카이브 질문 — 인용분만, 없으면 전체
        sources = cited.size ? parts.filter((_, i) => cited.has(i + 1)).map((p) => p.source) : parts.map((p) => p.source);
      }
      return c.json({
        answer,
        intent: "archive_rag",
        confidence: 0.9,
        fromCache: false,
        llmCalls: 1,
        sources,
        model: client.model,
        // RAG 투명성 — ?debug=1 또는 evidence=1이면 LLM에 넣은 근거 원문을 그대로 노출
        ...(c.req.query("debug") === "1" || c.req.query("evidence") === "1"
          ? { evidence: parts.map((p, i) => ({ n: i + 1, source: p.source.title, text: p.text })) }
          : {}),
      });
    }
  } catch { /* 실패 시 일반 경로로 폴백 */ }

  // ── ② 폴백: 근거 없으면 기존 일반 에이전트(순수 LLM) ──────────────
  const limitKrw = Number(c.env.MONTHLY_COST_LIMIT_KRW ?? "300000") || 300000;
  // NOTE: 비용 영속 저장은 cost 라우터(D1 도입 시)와 통합 예정. 무료 모델은 0원이라 차단 미발생.
  const recorder = new DefaultCostRecorder(new InMemoryCostStore());
  const circuitBreaker = new CircuitBreaker(new InMemoryMonthlyQuery([]), limitKrw);

  const llm = new HybridLlmRouter({
    batchClient: client,        // 무료 경로에선 batch·realtime 동일 클라이언트
    realtimeClient: client,
    recorder,
    circuitBreaker,
  });

  const runtime = createAgentRuntime({ llm, cache: sharedCache });

  try {
    const result = await runtime.ask({ query, domain, location, userTier: userTier ?? "anon" });
    return c.json({
      answer: result.answer ?? "",
      intent: result.intent ?? "other",
      confidence: result.confidence ?? null,
      fromCache: result.fromCache ?? false,
      llmCalls: result.llmCalls ?? 0,
      sources: result.sources ?? [],
      model: (result.metadata?.generationModel ?? result.metadata?.predictionModel ?? client.model) as string,
    });
  } catch (e) {
    return c.json(
      { error: "query_failed", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
