// AI Query Agent API — 자연어 질의 → LangGraph Lite(라우터→예측/생성)→ 출처 표기 응답
// PRD v1.8 §6 REQ-AI-001 / REQ-PRODUCT-002 / TaskMaster #23
//
// LLM 경로: Workers AI 무료 오픈모델(종량 0, 시크릿 불필요).
//   기존 HybridLlmRouter에 WorkersAiLlmClient를 batch·realtime 양쪽으로 꽂아
//   라우터 노드·캐시·비용기록·서킷 브레이커를 그대로 재사용.
// 캐시는 인메모리(아이솔레이트 수명) — 영속 캐시는 KV 도입 시 교체(아래 NOTE).

import { Hono } from "hono";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
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
import { completeAvoidingGarble, tidyAnswer, isSalad, isGarbledAnswer, stripForeignLetters } from "./answer_quality";
import { drainSse } from "./stream";
import { selectSources, type SourcePart, type QuerySource } from "./sources";
import { runGraph, type GraphNode } from "./graph_engine";
import { isGunsuFactQuery } from "../kg/facts";
import { isRelationQuery } from "../kg/relations";
import { extractKeywords, ftsRankTokens, QUERY_STOP, UBIQUITOUS } from "./keywords";
import { needsWeb } from "./web/gate";
import { searchWeb } from "./web/search";
import { rrfMerge } from "./rrf";
import { embedText } from "../lib/embed";

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

// Vectorize cosine 유사도 하한 — 약한(무관) 매치 배제
const MIN_SEMANTIC_SCORE = 0.5;

// 질문에서 핵심 키워드 추출 → 아카이브(FTS5 키워드 + Vectorize 의미)에서 근거 기사 검색, RRF 병합.
// 키워드 정규화(조사 제거·지역어 희석 제거)는 keywords.ts 참고.
async function retrieveArchive(
  env: Env,
  query: string,
): Promise<Array<{ idxno: number; title: string; published_at: string; body: string }>> {
  const db = env.ARCHIVE_DB;
  if (!db) return [];
  const cols = "a.idxno, a.title, a.published_at, substr(a.body,1,1300) AS body";

  // (1) 키워드 — FTS5(트라이그램) 우선, 짧은 질의 LIKE 폴백. idxno 순위 리스트.
  const tokens = extractKeywords(query);
  const ftsIds: number[] = [];
  if (tokens.length) {
    const ftsTokens = ftsRankTokens(tokens).map((t) => `"${t.replace(/"/g, "")}"`);
    if (ftsTokens.length) {
      try {
        const r = await db
          .prepare(
            `SELECT a.idxno FROM archive_fts f JOIN archive_articles a ON a.idxno=f.rowid ` +
              `WHERE archive_fts MATCH ? ORDER BY bm25(archive_fts) LIMIT 8`,
          )
          .bind(ftsTokens.join(" OR "))
          .all<{ idxno: number }>();
        for (const x of r.results ?? []) ftsIds.push(x.idxno);
      } catch { /* LIKE 폴백 */ }
    }
    if (!ftsIds.length) {
      const likePool = tokens.filter((t) => !UBIQUITOUS.has(t));
      const kw = `%${(likePool.length ? likePool : tokens).sort((a, b) => b.length - a.length)[0]}%`;
      const r = await db
        .prepare(`SELECT idxno FROM archive_articles WHERE title LIKE ?1 OR body LIKE ?1 ORDER BY published_at DESC LIMIT 8`)
        .bind(kw)
        .all<{ idxno: number }>();
      for (const x of r.results ?? []) ftsIds.push(x.idxno);
    }
  }

  // (2) 의미 — 질의 임베딩 → Vectorize 최근접. 실패 시 빈 리스트(키워드만).
  const vecIds: number[] = [];
  if (env.VECTORIZE && env.AI) {
    try {
      const vec = await embedText(env, query);
      if (vec) {
        const q = await env.VECTORIZE.query(vec, { topK: 8, returnMetadata: true });
        for (const m of q.matches ?? []) {
          if ((m.score ?? 0) < MIN_SEMANTIC_SCORE) continue;
          const md = (m.metadata ?? {}) as Record<string, unknown>;
          const idxno = Number(md.idxno ?? m.id);
          if (idxno) vecIds.push(idxno);
        }
      }
    } catch { /* 키워드만 */ }
  }

  // (3) RRF 병합 → 상위 6 idxno → 본문 일괄 로드(병합 순서 유지)
  const ids = rrfMerge([ftsIds, vecIds], { topN: 6 });
  if (!ids.length) return [];
  const ord = new Map(ids.map((id, i) => [id, i]));
  try {
    const rows = await db
      .prepare(`SELECT ${cols} FROM archive_articles a WHERE a.idxno IN (${ids.join(",")})`)
      .all<{ idxno: number; title: string; published_at: string; body: string }>();
    return (rows.results ?? []).sort((a, b) => (ord.get(a.idxno) ?? 99) - (ord.get(b.idxno) ?? 99));
  } catch {
    return [];
  }
}

// 아이솔레이트 단위 공유 캐시 — 동일 워커 인스턴스 내 반복 질의 히트
const sharedCache = new InMemoryCacheStore();

const querySchema = z.object({
  query: z.string().min(2).max(500),
  domain: z.enum(["tourism", "environment", "realestate", "general"]).optional(),
  location: z.string().max(40).optional(),
  userTier: z.enum(["anon", "b2c", "b2b", "b2g"]).optional(),
});

// 근거 대조 교열 프롬프트 — fp8이 흘린 숫자·글자를 [근거]에서 찾아 복원. 없는 숫자는 지어내지 않음.
const POLISH_SYS =
  "너는 한국어 교열자다. 아래 [근거]를 참고해 [초안]을 다듬어라. 할 일:\n" +
  "1) 빠진 연도·수치·글자·조사를 [근거]에서 찾아 정확히 복원하라(예: '개발은년부터'→근거의 연도로 '개발은 1997년부터', '이후2년'→'이후 2012년').\n" +
  "2) 근거에 없는 숫자·사실은 절대 지어내지 마라. 불확실하면 그 부분은 원문 그대로 두라.\n" +
  "3) 문단·불릿(- )·**굵게** 구조와 [번호] 출처 표기는 그대로 유지하라. 뜻·사실을 바꾸지 마라.\n" +
  "4) 오직 한글·아라비아 숫자·필요한 영문 약어만. 한자·일본어 등 외국 문자 금지. 교정한 본문만 출력(설명·머리말 금지).";

// 근거 대조 교열 — 초안의 빠진 숫자·글자를 [근거]로 복원한 tidy 완성본 반환. 근거·초안이 없으면 정리만.
// 스트리밍을 끄고 '완성본만 표시'하므로 서버가 이 정확본을 만들어 반환한다. 실패·과단축 시 원본 유지.
async function polishDraft(
  client: WorkersAiLlmClient,
  draft: string,
  context: string,
): Promise<string> {
  if (!context.trim() || draft.trim().length < 20) return tidyAnswer(draft);
  try {
    const res = await completeAvoidingGarble(client, {
      channel: "realtime" as const,
      maxTokens: 1200,
      temperature: 0.1,
      messages: [
        { role: "system" as const, content: POLISH_SYS },
        { role: "user" as const, content: `[근거]\n${context}\n\n[초안]\n${draft}` },
      ],
    });
    const out = tidyAnswer(res.content);
    return out.length >= draft.length * 0.5 ? out : tidyAnswer(draft);
  } catch {
    return tidyAnswer(draft);
  }
}

// 날씨·대기질 실시간 관측 + (예보/주말 질의면) 주말 기상예보 근거 — 메인·그래프 공용. 게이트는 호출부.
async function buildRealtimeEvidence(env: Env, query: string): Promise<SourcePart[]> {
  const out: SourcePart[] = [];
  const cond = await fetchConditions(env);
  if (cond.available && (cond.weather.temp != null || cond.air.pm10 != null || cond.air.grade)) {
    const w = cond.weather, a = cond.air;
    const text =
      `태안 실시간 관측(${String(cond.observedAt).slice(0, 16).replace("T", " ")} KST) — ` +
      `기온 ${w.temp ?? "?"}℃, 습도 ${w.humidity ?? "?"}%, 하늘 ${w.sky ?? "?"}, 강수 ${w.pty ?? "?"}; ` +
      `미세먼지(PM10) ${a.pm10 ?? "?"}㎍/㎥, 초미세(PM2.5) ${a.pm25 ?? "?"}㎍/㎥, 오존 ${a.o3 ?? "?"}ppm, ` +
      `통합대기 '${a.grade ?? "?"}' (측정소 ${a.station ?? "?"})`;
    out.push({ text, source: { title: "실시간 관측 · 기상청 단기예보 / 에어코리아", url: null, publishedAt: cond.observedAt ?? undefined } });
  }
  // 예보·주말·내일 질문이면 주말/다가오는 날 예보 — 단기(±3일) 우선, 범위 밖이면 중기(3~10일)
  if (/예보|주말|다음\s?주|내일|모레|이번\s?주/.test(query)) {
    try {
      const [dem, mid] = await Promise.all([forecastDemand(env), fetchMidForecast(env)]);
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
        out.push({ text: `태안 주말 기상예보 — ${[sat, sun].filter(Boolean).join(" / ")}`, source: { title: "기상청 단기·중기예보", url: null } });
      }
    } catch { /* 무시 */ }
  }
  return out;
}

// 인물 브리핑(A2) 카드 — 질의에 등장 많은 KG 인물 감지 시 AI 요약(검증 아님). 메인·그래프 공용.
async function buildPersonBriefCard(env: Env, query: string, offRegion: boolean): Promise<{ id: string; name: string; text: string } | null> {
  try {
    if (!env.ARCHIVE_DB || !env.AI || offRegion) return null;
    const { detectPersonInQuery, buildPersonBrief } = await import("../kg/people");
    const hit = await detectPersonInQuery(env.ARCHIVE_DB, query);
    if (!hit) return null;
    const text = await buildPersonBrief(env.ARCHIVE_DB, env.AI, hit.id);
    return text ? { id: hit.id, name: hit.name, text } : null;
  } catch { return null; }
}

// 내 가게 맞춤 분석 근거 — 로그인(익명 uid)에 가게 정보가 있고 사업/주말/추천 질문이면 본인 업종 보드. 메인·그래프 공용.
async function buildMyShopEvidence(env: Env, uid: string | undefined, query: string, recommend: boolean): Promise<SourcePart[]> {
  if (!uid || !env.ARCHIVE_DB || !(MYSHOP_RE.test(query) || recommend || /주말|예보|이번\s?주|다음\s?주/.test(query))) return [];
  try {
    const { D1PreferencesRepo } = await import("../preferences/repository_d1");
    const prefs = await new D1PreferencesRepo(env.ARCHIVE_DB).get(uid);
    if (prefs?.shopProfile) {
      const { loadOwnerBrief } = await import("../owner/brief");
      const text = buildShopEvidence(await loadOwnerBrief(env, prefs));
      if (text) return [{ text, source: { title: "내 가게 맞춤 분석(태안 수요·날씨 기반)", url: null } }];
    }
  } catch { /* 가게 분석 실패는 무시 */ }
  return [];
}

// 큐레이션 사실(fact table) 근거 — 메인·그래프 공용.
async function buildFactsEvidence(env: Env, query: string): Promise<SourcePart[]> {
  if (!env.ARCHIVE_DB) return [];
  try {
    const { loadFacts, matchFacts } = await import("./facts");
    return matchFacts(query, await loadFacts(env.ARCHIVE_DB), 2).map((f) => ({
      text: `[확인된 사실] ${f.title}\n${f.content}`,
      source: { title: f.source ? `${f.title} · ${f.source}` : f.title, url: null },
    }));
  } catch { return []; }
}

// KG 검증 군수 계보 근거 — 메인·그래프 공용.
async function buildGunsuFactEvidence(env: Env, query: string): Promise<SourcePart[]> {
  if (!env.ARCHIVE_DB || !isGunsuFactQuery(query)) return [];
  try {
    const { buildGunsuFactBlock } = await import("../kg/facts");
    const { getGunsuLineage } = await import("../kg/repository");
    const { items, source } = await getGunsuLineage(env.ARCHIVE_DB);
    const block = buildGunsuFactBlock(items, source);
    return block ? [block] : [];
  } catch { return []; }
}

// KG 검증 인물관계(B3) 근거 — 메인·그래프 공용. 관계형 질의 + 인물 감지 시 verified=1만.
async function buildRelationEvidence(env: Env, query: string): Promise<SourcePart[]> {
  if (!env.ARCHIVE_DB || !isRelationQuery(query)) return [];
  try {
    const { getVerifiedRelations, buildRelationFactBlock } = await import("../kg/relations");
    const { detectPersonInQuery } = await import("../kg/people");
    const hit = await detectPersonInQuery(env.ARCHIVE_DB, query);
    if (!hit) return [];
    const block = buildRelationFactBlock(hit.name, await getVerifiedRelations(env.ARCHIVE_DB, hit.id));
    return block ? [block] : [];
  } catch { return []; }
}

// 지역언론(최신 태안 소식) 근거 — 질의 키워드 매칭 상위 3건(최신순). 메인·그래프 공용.
async function buildRegionalNewsEvidence(env: Env, query: string): Promise<SourcePart[]> {
  if (!env.ARCHIVE_DB) return [];
  try {
    const kw = extractKeywords(query).filter((t) => t.length >= 2 && !UBIQUITOUS.has(t)).sort((a, b) => b.length - a.length)[0];
    if (!kw) return [];
    const like = `%${kw}%`;
    const r = await env.ARCHIVE_DB
      .prepare("SELECT source, title, excerpt, published_at, url FROM regional_news WHERE title LIKE ?1 OR excerpt LIKE ?1 ORDER BY published_at DESC LIMIT 3")
      .bind(like)
      .all<{ source: string; title: string; excerpt: string | null; published_at: string | null; url: string }>();
    return (r.results ?? []).map((n) => ({
      text: `${n.title} (${String(n.published_at ?? "").slice(0, 10)})\n${n.excerpt ?? ""}`,
      source: { title: `[${n.source}] ${n.title}`, url: n.url, publishedAt: n.published_at ?? undefined, kind: "web" },
    }));
  } catch { return []; }
}

// 부동산 실거래(국토부, 읍·면 필터 + ㎡당 단가·월별 추이·전체 대비) 근거 — 메인·그래프 공용. 게이트는 호출부.
async function buildRealestateEvidence(env: Env, query: string, location?: string): Promise<SourcePart[]> {
  const re = await fetchRealEstateDeep(env);
  if (!re.available || (!re.apartments.length && !re.lands.length)) return [];
  const EUPMYEON = ["태안읍", "안면읍", "고남면", "근흥면", "남면", "소원면", "원북면", "이원면"];
  const hay = `${query} ${location ?? ""}`;
  const eup = EUPMYEON.find((e) => hay.includes(e)) ?? (/안면도/.test(hay) ? "안면읍" : null);
  const inEup = (d: string) => !eup || (d ?? "").includes(eup);
  const scope = eup ?? "태안군";
  type Item = { manwon: number; area: string; ymd: string };
  const stat = (items: Item[]) => {
    const v = items.filter((x) => x.manwon > 0 && Number(x.area) > 0);
    if (!v.length) return null;
    const unit = v.map((x) => x.manwon / Number(x.area));
    const avgU = unit.reduce((s, u) => s + u, 0) / unit.length;
    const ymds = v.map((x) => x.ymd).filter(Boolean).sort();
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
  if (eup && countyLand) {
    const sparse = (landStat?.n ?? 0) < 3;
    lines.push(`· (참고) 태안군 전체 토지 ㎡당 평균 ${countyLand.avgU}만원(${countyLand.n}건, ${countyLand.from}~${countyLand.to})${countyApt ? `, 아파트 ㎡당 평균 ${countyApt.avgU}만원` : ""}`);
    if (sparse) lines.push(`  ${eup} 표본이 적어 추세 단정이 어렵습니다. 태안군 전체 토지 월별 추이 — ${countyLand.monthly}`);
  }
  return [{ text: lines.join("\n"), source: { title: `국토교통부 실거래가 · ${scope}(6개월)`, url: null } }];
}

// 관광 수요·축제 근거 — 메인·그래프 공용. 게이트는 호출부.
async function buildTourEvidence(env: Env): Promise<SourcePart[]> {
  const lines: string[] = [];
  try {
    const t = await fetchTour(env);
    const fests = (t.festivals ?? [])
      .map((f) => ({ ...f, dday: ymd8Dday(f.start) }))
      .filter((f) => f.dday >= -3)
      .sort((a, b) => a.dday - b.dday)
      .slice(0, 8);
    if (fests.length) {
      lines.push("축제·행사: " + fests.map((f) => `${f.title}(${f.start}~${f.end}${f.dday >= 0 && f.dday <= 60 ? `, D-${f.dday}` : ""}${f.addr ? `, ${f.addr}` : ""})`).join("; "));
    }
  } catch { /* 무시 */ }
  if (env.DATA_GO_KR_KEY) {
    try {
      const dem = await forecastDemand(env);
      if (dem?.available) {
        const fac = (dem.factors ?? []).map((f) => `${f.label} ${f.effect > 0 ? "+" : ""}${f.effect}(${f.detail})`).join(", ");
        lines.push(`주말 관광 수요지수: ${dem.index}점 '${dem.level}' (${dem.weekend.sat}~${dem.weekend.sun}). ${dem.headline}. 기여 요인 — ${fac}`);
      }
    } catch { /* 무시 */ }
  }
  return lines.length ? [{ text: `[태안 관광 수요·행사]\n${lines.join("\n")}`, source: { title: "관광 수요예측·축제(TourAPI·기상 기반)", url: null } }] : [];
}

// 바다·해변(일출몰·물때·수온·파고·서핑) 근거 — 메인·그래프 공용. 게이트는 호출부.
async function buildMarineEvidence(env: Env): Promise<SourcePart[]> {
  try {
    const m = await loadMarine(env);
    if (m.available) {
      const seg: string[] = [];
      if (m.sun) seg.push(`오늘 일출 ${m.sun.sunrise}, 일몰 ${m.sun.sunset} (태안 기준 천문계산)`);
      if (m.tide?.events?.length) seg.push(`오늘 물때(${m.tide.station}): ${m.tide.events.map((e) => `${e.type === "고조" ? "만조" : "간조"} ${e.time}`).join(", ")}`);
      if (m.beaches?.length) seg.push(`해변: ${m.beaches.map((b) => `${b.name} 수온 ${b.waterTemp ?? "?"}℃·파고 ${b.waveHeight ?? "?"}m${b.beachIndex ? `·해수욕지수 ${b.beachIndex}` : ""}`).join("; ")}`);
      if (m.surf) seg.push(`서핑(${m.surf.spot}): 파고 ${m.surf.wave ?? "?"}m·수온 ${m.surf.waterTemp ?? "?"}℃`);
      if (m.mudflat?.length) seg.push(`갯벌체험 적기: ${m.mudflat.join(", ")}`);
      if (seg.length) return [{ text: `[태안 바다·해변 실시간]\n${seg.join("\n")}`, source: { title: "국립해양조사원·일출몰 천문계산(실시간)", url: null } }];
    }
  } catch { /* 무시 */ }
  return [];
}

// 태안군청 군정소식·주간행사계획 근거 — 메인·그래프 공용. 게이트는 호출부(ARCHIVE_DB 없으면 빈 배열).
async function buildEventsEvidence(env: Env): Promise<SourcePart[]> {
  if (!env.ARCHIVE_DB) return [];
  try {
    const r = await env.ARCHIVE_DB
      .prepare(
        `SELECT board_name, title, dept, published_at, substr(body,1,2200) AS body FROM gov_notices
         ORDER BY (board_name='주간행사계획') DESC, published_at DESC, ntt_id DESC LIMIT 10`,
      )
      .all<{ board_name: string; title: string; dept: string | null; published_at: string; body: string | null }>();
    const rows = r.results ?? [];
    if (rows.length) {
      const text = "[태안군청 군정 소식·주간행사계획]\n" + rows.map((n) => {
        const head = `· [${n.board_name}] ${n.title} (${String(n.published_at).slice(0, 10)}${n.dept ? `, ${n.dept}` : ""})`;
        return n.board_name === "주간행사계획" && n.body ? `${head}\n  ${n.body.replace(/\s+/g, " ").trim()}` : head;
      }).join("\n");
      return [{ text, source: { title: "태안군청 군정 소식·주간행사계획", url: null } }];
    }
  } catch { /* 무시 */ }
  return [];
}

// 본답 시스템 프롬프트 — 메인 핸들러·그래프 시제품 공용(품질 일관 유지).
function answerSystemPrompt(todayKst: string): string {
  return (
    `너는 태안 지역정보 도우미다. 오늘은 ${todayKst}(한국 시간)이다. 아래 [근거](실시간 관측값·국토부 실거래·관광 수요·축제·태안신문 기사)를 근거로 한국어로 충실히 답하라.\n` +
    "- 오늘보다 이전의 연도·월·기간은 이미 '지난 일'이다. 과거에 대해 '예측·전망·~할 가능성' 같은 표현을 쓰지 말고 근거의 실제 수치로 '사실'로 서술하라. 과거 기간의 데이터가 근거에 없으면 '해당 기간의 실제 데이터를 찾지 못했습니다'라고 명확히 밝히고 지어내거나 추정·예측하지 마라. '예측·전망'은 오직 오늘 이후의 미래에 대해서만 하라.\n" +
    "- 답변은 오직 한글·아라비아 숫자·필요한 영문 약어만 사용하라. 한자·중국어·일본어 등 외국 문자를 절대 쓰지 마라(예: '施设'가 아니라 '시설', '国内'가 아니라 '국내').\n" +
    "- 근거의 수치를 최대한 활용해 구체적이고 충분한 분량(3~6문장)으로 답하라. 한 줄로 끝내지 마라.\n" +
    "- 표(마크다운 파이프 '|')나 아스키 차트를 본문에 직접 그리지 마라. 수치는 문장·불릿으로 자연스럽게 설명하라(차트 시각화는 화면이 담당한다).\n" +
    "- 가독성을 위해 답을 2~4개의 짧은 문단으로 나누고(문단 사이 빈 줄 한 줄), 여러 항목을 나열할 때는 각 줄 앞에 '- '를 붙여 목록으로 제시하라. 핵심 수치·이름·날짜는 **굵게** 강조하라. 문장 하나하나를 줄바꿈으로 쪼개지 말고 의미 단위로 문단을 묶어라.\n" +
    "- 부동산 질문이면 ㎡당 평균 단가·거래 건수·기간·월별 추이·태안군 전체 대비를 종합해 '시세 흐름'을 설명하라.\n" +
    "- 표본이 적으면 '거래가 N건으로 적어 추세 단정은 어렵다'처럼 한계를 함께 밝히되, 있는 데이터는 모두 활용하라.\n" +
    "- 실시간 관측값이 있으면 그 수치를 우선 사용하라.\n" +
    "- 근거가 질문과 '완전히' 무관할 때만 '해당 정보를 찾지 못했습니다'라고 하라.\n" +
    "- 근거에 없는 사실을 지어내지 마라. 답변 끝에 사용한 출처를 [번호]로 표기하라.\n" +
    "- 웹 출처(공식 .go.kr·관광공사·지역언론)는 최신 정보다. 원문을 그대로 베끼지 말고 요약하며, 공식 출처를 우선하라.\n" +
    "- '[근거]', '근거를 토대로', '제공된 정보' 같은 표현을 쓰지 말고 바로 본문 내용으로 자연스럽게 답하라.\n" +
    "- '이번 주/다음 주' 행사는 군청 주간행사계획·축제 일정을 우선 사용하고, 이미 끝난 과거 행사는 답에 넣지 마라.\n" +
    "- '오늘 뭐하지/추천' 류 질문이면 오늘의 날씨·바다(물때·일출몰)·진행 중 축제·행사를 종합해 구체적인 활동을 추천하라(예: 맑고 낮 간조면 갯벌체험, 비 예보면 실내). 과거 기사로 답하지 마라.\n" +
    "- '[내 가게 맞춤 분석]' 근거가 있으면 그 사장님 본인 가게 데이터다. '우리 가게/모텔/식당' 질문엔 그 수치(가동률·예상 손님·권장가·매출·출항 가부 등)로 사장님에게 말하듯 구체적으로 답하고, 실행 조치도 1~2개 제안하라."
  );
}

// SSE 스트리밍 응답 — 토큰을 event:token으로 흘려보내고, 완료 후 정리본·출처·브리핑을 event:done으로.
// 클라이언트는 done.answer(tidy 완료본)로 스트림 텍스트를 교체한다. salad면 1회 비스트림 재생성으로 교체.
async function streamAnswer(
  c: Context<{ Bindings: Env }>,
  client: WorkersAiLlmClient,
  llmReq: Parameters<WorkersAiLlmClient["stream"]>[0],
  parts: SourcePart[],
  briefPromise: Promise<{ id: string; name: string; text: string } | null>,
): Promise<Response> {
  return streamSSE(c, async (stream) => {
    let raw = "";
    try {
      const reader = (await client.stream(llmReq)).getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const d = drainSse(buf);
        buf = d.rest;
        for (const t of d.tokens) {
          raw += t;
          await stream.writeSSE({ event: "token", data: JSON.stringify(t) });
        }
        if (d.done) break;
      }
    } catch {
      // 스트림 실패 → 비스트림 1회 폴백
      try {
        raw = (await client.complete(llmReq)).content;
        await stream.writeSSE({ event: "token", data: JSON.stringify(raw) });
      } catch {
        await stream.writeSSE({ event: "error", data: JSON.stringify("답변 생성에 실패했습니다.") });
        return;
      }
    }

    // 완성본이 salad면(스트림 중 이미 전송됐어도) 1회 비스트림 재생성으로 교체
    let finalRaw = raw;
    if (isSalad(finalRaw)) {
      try {
        const r = await client.complete(llmReq);
        if (!isSalad(r.content)) finalRaw = r.content;
      } catch { /* 유지 */ }
    }
    // 외국문자 누수는 제거(토큰 salad엔 무영향)
    let cleaned = finalRaw;
    if (isGarbledAnswer(cleaned)) {
      const stripped = stripForeignLetters(cleaned);
      if (stripped && stripped !== cleaned && !isGarbledAnswer(stripped)) cleaned = stripped;
    }
    const answer = tidyAnswer(cleaned);
    const sources = selectSources(parts, finalRaw); // 출처는 원문 [번호] 기준
    const personBrief = await briefPromise;
    const withEvidence = c.req.query("evidence") === "1" || c.req.query("debug") === "1";
    await stream.writeSSE({
      event: "done",
      data: JSON.stringify({
        answer,
        intent: "archive_rag",
        confidence: 0.9,
        fromCache: false,
        llmCalls: finalRaw === raw ? 1 : 2,
        sources,
        model: client.model,
        ...(personBrief ? { personBrief } : {}),
        ...(withEvidence ? { evidence: parts.map((p, i) => ({ n: i + 1, source: p.source.title, text: p.text })) } : {}),
      }),
    });
  });
}

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
  const baseClient = new WorkersAiLlmClient({ ai: c.env.AI });
  // 진단용 LLM 호출 카운터/타이밍 — ?debug=1일 때만 응답에 노출.
  let llmCalls = 0;
  let llmMs = 0;
  const client = {
    model: baseClient.model,
    complete: async (req: Parameters<typeof baseClient.complete>[0]) => {
      llmCalls++;
      const s = Date.now();
      try { return await baseClient.complete(req); } finally { llmMs += Date.now() - s; }
    },
  } as typeof baseClient;
  const tStart = Date.now();
  try {
    const parts: Array<{ text: string; source: { title: string; url: string | null; publishedAt?: string; kind?: string } }> = [];
    const recommend = RECOMMEND_RE.test(query); // 추천 질문 → 오늘 날씨·바다·행사·수요 종합
    // 타지역만 언급(태안 용어 없음) → 태안 실시간 데이터 주입 차단(강남 날씨에 태안값 오표기 방지)
    const offRegion = OTHER_REGION_RE.test(query) && !AREA_RE.test(query);
    if (offRegion) {
      parts.push({ text: "이 서비스는 충청남도 태안군 지역 정보만 제공합니다. 태안 외 지역의 날씨·시세·관광 데이터는 보유하지 않습니다.", source: { title: "안내 · 태안 전용 서비스", url: null } });
    }

    // (a-0) 내 가게 맞춤 — 공용 헬퍼(그래프와 동일). hasMyShop은 아카이브 게이트에 사용.
    const uid = c.req.header("X-Taean-Uid");
    const myShopParts = await buildMyShopEvidence(c.env, uid, query, recommend);
    parts.push(...myShopParts);
    const hasMyShop = myShopParts.length > 0;

    // (a) 날씨·대기질 질문이면 실시간 관측값(+예보) 근거 추가 — 공용 헬퍼(그래프와 동일 코드)
    if ((WEATHER_RE.test(query) || recommend) && c.env.DATA_GO_KR_KEY && !offRegion) {
      parts.push(...(await buildRealtimeEvidence(c.env, query)));
    }

    // (a-2) 부동산·실거래 — 공용 헬퍼(그래프와 동일)
    if (REALESTATE_RE.test(query) && c.env.DATA_GO_KR_KEY && !offRegion) {
      parts.push(...(await buildRealestateEvidence(c.env, query, location)));
    }

    // (a-3) 관광 수요·축제 — 공용 헬퍼(그래프와 동일)
    if ((TOURISM_RE.test(query) || recommend) && !offRegion) {
      parts.push(...(await buildTourEvidence(c.env)));
    }

    // (a-4) 바다·해변(일출몰·물때·수온·파고·서핑) — 공용 헬퍼
    if ((MARINE_RE.test(query) || recommend) && c.env.DATA_GO_KR_KEY && !offRegion) {
      parts.push(...(await buildMarineEvidence(c.env)));
    }

    // (a-5) 군정·주간행사계획 — 공용 헬퍼
    if ((EVENT_RE.test(query) || recommend) && c.env.ARCHIVE_DB && !offRegion) {
      parts.push(...(await buildEventsEvidence(c.env)));
    }

    // (a-6) 큐레이션 사실 / (a-6.5) 군수 계보 / (a-6.6) 검증 인물관계 — 공용 헬퍼
    if (c.env.ARCHIVE_DB && !offRegion) {
      parts.push(...(await buildFactsEvidence(c.env, query)));
      parts.push(...(await buildGunsuFactEvidence(c.env, query)));
      parts.push(...(await buildRelationEvidence(c.env, query)));
    }

    // (b) 아카이브·태안뉴스 근거 검색 — 단, 순수 날씨 질문이면 기사 출처는 생략
    if (c.env.ARCHIVE_DB && !isPureWeather(query) && !recommend && !hasMyShop) {
      const rows = await retrieveArchive(c.env, query);
      for (const r of rows) {
        parts.push({ text: `${r.title} (${String(r.published_at).slice(0, 10)})\n${r.body}`, source: { title: r.title, url: `/news/${r.idxno}`, publishedAt: r.published_at } });
      }
    }

    // (b-2) 지역언론(최신 태안 소식) — 공용 헬퍼
    if (c.env.ARCHIVE_DB && !isPureWeather(query) && !offRegion) {
      parts.push(...(await buildRegionalNewsEvidence(c.env, query)));
    }

    // (c) 로컬 근거가 약하거나 최신-상황 질문이면 화이트리스트 웹 검색으로 보강(게이트·캐시·fail-open)
    if (!offRegion && needsWeb(query, parts)) {
      try {
        const web = await searchWeb(c.env, query);
        for (const w of web) {
          parts.push({
            text: `${w.title}${w.publishedAt ? ` (${w.publishedAt})` : ""}\n${w.text}`,
            source: { title: w.title, url: w.url, publishedAt: w.publishedAt, kind: "web" },
          });
        }
      } catch { /* 웹 실패는 무시(로컬로) */ }
    }

    if (parts.length) {
      const context = parts.map((p, i) => `[${i + 1}] ${p.text}`).join("\n\n");
      // (A2) 질의가 인물 중심이면 인물 브리핑을 답변 생성과 '병렬'로 만들어 카드로 첨부(공개, 검증 아님 표기). 공용 헬퍼.
      const briefPromise = buildPersonBriefCard(c.env, query, offRegion);
      const tRetrieveDone = Date.now();
      // 현재 날짜(KST) — 모델이 오늘을 몰라 과거 연도를 '미래처럼 예측'하는 모순 방지.
      const nowKst = new Date(Date.now() + 9 * 3600_000);
      const todayKst = `${nowKst.getUTCFullYear()}년 ${nowKst.getUTCMonth() + 1}월 ${nowKst.getUTCDate()}일`;
      // 본답 LLM 요청 — 스트림/JSON 경로 공용.
      const llmReq = {
        channel: "realtime" as const,
        maxTokens: 800,
        temperature: 0.1,
        messages: [
          { role: "system" as const, content: answerSystemPrompt(todayKst) },
          { role: "user" as const, content: `[근거]\n${context}\n\n[질문] ${query}` },
        ],
      };

      // 스트리밍 경로(?stream=1) — 토큰을 흘려보내 체감 지연↓. 완료 후 정리본·출처·브리핑을 done 이벤트로.
      if (c.req.query("stream") === "1") {
        return streamAnswer(c, baseClient, llmReq, parts, briefPromise);
      }

      // 무료 fp8 모델이 간헐적으로 토큰 붕괴(salad)를 뱉으므로, 붕괴 감지 시 1회 재시도.
      const res = await completeAvoidingGarble(client, llmReq);
      // 출처·notFound는 '원문'([번호] 인용) 기준으로 계산 — 교열이 표현을 바꿔도 근거 선택이 안 흔들린다.
      const rawAnswer = res.content;
      // 완성본만 표시하므로(스트리밍 끔) 서버에서 근거 대조 교열까지 끝낸 '정확본'을 반환.
      // fp8이 흘린 연도 숫자를 [근거]로 복원 → 화면·PDF 모두 처음부터 정확(눈앞 스왑 없음).
      const answer = await polishDraft(client, rawAnswer, context);
      const sources = selectSources(parts, rawAnswer);
      const personBrief = await briefPromise;
      return c.json({
        answer,
        intent: "archive_rag",
        confidence: 0.9,
        fromCache: false,
        llmCalls,
        sources,
        model: client.model,
        ...(personBrief ? { personBrief } : {}),
        // RAG 투명성 — ?debug=1 또는 evidence=1이면 LLM에 넣은 근거 원문을 그대로 노출
        ...(c.req.query("debug") === "1" || c.req.query("evidence") === "1"
          ? {
              evidence: parts.map((p, i) => ({ n: i + 1, source: p.source.title, text: p.text })),
              _timing: {
                totalMs: Date.now() - tStart,
                retrieveMs: tRetrieveDone - tStart, // 검색·근거수집(웹검색 포함)
                llmMs,                               // LLM 생성 합계
                llmCalls,                            // 실제 Workers AI 호출 횟수(붕괴 재시도 포함)
                contextChars: context.length,
              },
            }
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

// POST /api/query/polish — 저장/공유용 교열. 스트리밍 답(fp8 숫자 흘림 가능)을 [근거]와 대조해
//   빠진 숫자·글자를 복원한 깨끗한 버전 반환. PDF 저장 시에만 호출(읽기 속도는 스트리밍 유지).
const polishSchema = z.object({
  draft: z.string().min(1).max(8000),
  evidence: z.array(z.object({ n: z.number(), source: z.string(), text: z.string().max(4000) })).max(20).optional(),
});
queryRouter.post("/polish", async (c) => {
  if (!c.env.AI) return c.json({ error: "ai_unbound" }, 503);
  const parsed = polishSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  const { draft, evidence } = parsed.data;
  const client = new WorkersAiLlmClient({ ai: c.env.AI });
  const context = (evidence ?? []).map((e) => `[${e.n}] ${e.source}\n${e.text}`).join("\n\n");
  const answer = await polishDraft(client, draft, context);
  return c.json({ answer });
});

// POST /api/query/graph — [시제품] 경량 그래프 실행기로 '진짜 단계 진행'을 SSE로 스트리밍.
//   기존 검색·생성·교열 함수를 노드로 재사용(추가 LLM 비용 없음: 생성 1~2 + 교열 1, Workers AI 무료).
//   event: progress {node,label,phase,pct} … 노드 완료마다 → event: done {answer,sources,...}.
//   기존 /api/query와 '나란히' 도는 opt-in 경로(운영 기본 경로는 그대로).
queryRouter.post("/graph", async (c) => {
  if (!c.env.AI) return c.json({ error: "ai_unbound" }, 503);
  const parsed = querySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  const { query, location } = parsed.data;

  const baseClient = new WorkersAiLlmClient({ ai: c.env.AI });
  let llmCalls = 0;
  const client = {
    model: baseClient.model,
    complete: async (r: Parameters<typeof baseClient.complete>[0]) => { llmCalls++; return baseClient.complete(r); },
  } as typeof baseClient;
  const nowKst = new Date(Date.now() + 9 * 3600_000);
  const todayKst = `${nowKst.getUTCFullYear()}년 ${nowKst.getUTCMonth() + 1}월 ${nowKst.getUTCDate()}일`;
  const weather = WEATHER_RE.test(query) || RECOMMEND_RE.test(query);
  const recommend = RECOMMEND_RE.test(query);
  const offRegion = OTHER_REGION_RE.test(query) && !AREA_RE.test(query);
  const uid = c.req.header("X-Taean-Uid");

  interface GState {
    parts: SourcePart[]; context: string; raw: string; answer: string; sources: QuerySource[];
    webDone?: boolean;  // 웹 검색을 이미 돌렸나
    needMore?: boolean; // 첫 답이 '못 찾음/약함' → 보강 필요
    gotMore?: boolean;  // 보강 검색이 실제로 근거를 더 찾았나
    hasMyShop?: boolean; // 내 가게 근거 주입됨(아카이브 게이트에 사용)
  }
  // 근거로 답 생성(compose·recompose 공용)
  const composeAnswer = async (parts: SourcePart[]): Promise<{ context: string; raw: string }> => {
    const context = parts.map((p, i) => `[${i + 1}] ${p.text}`).join("\n\n");
    const res = await completeAvoidingGarble(client, {
      channel: "realtime" as const,
      maxTokens: 800,
      temperature: 0.1,
      messages: [
        { role: "system" as const, content: answerSystemPrompt(todayKst) },
        { role: "user" as const, content: `[근거]\n${context}\n\n[질문] ${query}` },
      ],
    });
    return { context, raw: res.content };
  };
  const isWeak = (raw: string) => /찾지 못했|찾을 수 없|정보가 없|정보를 찾지|확인되지|해당 정보를/.test(raw);

  const nodes: GraphNode<GState>[] = [
    { name: "understand", label: "질문 이해 중", run: () => {} },
    {
      name: "myshop", label: "내 가게 데이터 확인 중",
      when: () => !!uid && !!c.env.ARCHIVE_DB && (MYSHOP_RE.test(query) || recommend || /주말|예보|이번\s?주|다음\s?주/.test(query)),
      run: async (s) => {
        const p = await buildMyShopEvidence(c.env, uid, query, recommend);
        return { parts: [...s.parts, ...p], hasMyShop: p.length > 0 };
      },
    },
    // ── 특수 분기(KG Fact) — 큐레이션 사실·군수 계보·검증 인물관계(해당 질의에서만 내부 게이트로 발동) ──
    {
      name: "facts", label: "확인된 사실·인물관계 확인 중",
      when: () => !!c.env.ARCHIVE_DB && !offRegion,
      run: async (s) => ({
        parts: [
          ...s.parts,
          ...(await buildFactsEvidence(c.env, query)),
          ...(await buildGunsuFactEvidence(c.env, query)),
          ...(await buildRelationEvidence(c.env, query)),
        ],
      }),
    },
    {
      name: "archive", label: "아카이브 검색 중",
      when: (s) => !!c.env.ARCHIVE_DB && !isPureWeather(query) && !recommend && !offRegion && !s.hasMyShop,
      run: async (s) => {
        const rows = await retrieveArchive(c.env, query);
        const parts = [...s.parts];
        for (const r of rows) parts.push({ text: `${r.title} (${String(r.published_at).slice(0, 10)})\n${r.body}`, source: { title: r.title, url: `/news/${r.idxno}`, publishedAt: r.published_at } });
        return { parts };
      },
    },
    {
      name: "regional", label: "지역언론 최신 확인 중",
      when: () => !!c.env.ARCHIVE_DB && !isPureWeather(query) && !offRegion,
      run: async (s) => ({ parts: [...s.parts, ...(await buildRegionalNewsEvidence(c.env, query))] }),
    },
    {
      name: "realtime", label: "실시간 데이터 확인 중",
      when: () => weather && !!c.env.DATA_GO_KR_KEY && !offRegion,
      run: async (s) => {
        try { return { parts: [...s.parts, ...(await buildRealtimeEvidence(c.env, query))] }; }
        catch { return {}; }
      },
    },
    {
      name: "tour", label: "관광 수요·축제 확인 중",
      when: () => (TOURISM_RE.test(query) || recommend) && !offRegion,
      run: async (s) => ({ parts: [...s.parts, ...(await buildTourEvidence(c.env))] }),
    },
    {
      name: "marine", label: "바다·물때 확인 중",
      when: () => (MARINE_RE.test(query) || recommend) && !!c.env.DATA_GO_KR_KEY && !offRegion,
      run: async (s) => ({ parts: [...s.parts, ...(await buildMarineEvidence(c.env))] }),
    },
    {
      name: "events", label: "군정·주간행사 확인 중",
      when: () => (EVENT_RE.test(query) || recommend) && !!c.env.ARCHIVE_DB && !offRegion,
      run: async (s) => ({ parts: [...s.parts, ...(await buildEventsEvidence(c.env))] }),
    },
    {
      name: "realestate", label: "부동산 실거래 확인 중",
      when: () => REALESTATE_RE.test(query) && !!c.env.DATA_GO_KR_KEY && !offRegion,
      run: async (s) => ({ parts: [...s.parts, ...(await buildRealestateEvidence(c.env, query, location))] }),
    },
    {
      name: "web", label: "공식 · 지역언론에서 최신 정보 찾는 중",
      when: (s) => !offRegion && needsWeb(query, s.parts),
      run: async (s) => {
        try {
          const web = await searchWeb(c.env, query);
          const parts = [...s.parts];
          for (const w of web) parts.push({ text: `${w.title}${w.publishedAt ? ` (${w.publishedAt})` : ""}\n${w.text}`, source: { title: w.title, url: w.url, publishedAt: w.publishedAt, kind: "web" } });
          return { parts, webDone: true };
        } catch { return { webDone: true }; }
      },
    },
    {
      name: "compose", label: "답변 작성 중",
      run: async (s) => {
        const { context, raw } = await composeAnswer(s.parts);
        // 첫 답이 '못 찾음'이고 아직 웹을 안 돌렸으면 보강 루프 진입
        return { context, raw, needMore: isWeak(raw) && !s.webDone };
      },
    },
    // ── ② 반복 RAG: 첫 답이 약하면 웹으로 근거 보강 → 재작성(최대 1회, 근거가 실제로 늘 때만) ──
    {
      name: "reweb", label: "근거 더 찾는 중",
      when: (s) => !!s.needMore && !offRegion,
      run: async (s) => {
        try {
          const web = await searchWeb(c.env, query);
          const parts = [...s.parts];
          for (const w of web) parts.push({ text: `${w.title}${w.publishedAt ? ` (${w.publishedAt})` : ""}\n${w.text}`, source: { title: w.title, url: w.url, publishedAt: w.publishedAt, kind: "web" } });
          return { parts, webDone: true, gotMore: web.length > 0 };
        } catch { return { webDone: true, gotMore: false }; }
      },
    },
    {
      name: "recompose", label: "답변 다시 작성 중",
      when: (s) => !!s.gotMore,
      run: async (s) => {
        const { context, raw } = await composeAnswer(s.parts);
        return { context, raw };
      },
    },
    { name: "refine", label: "근거 대조 교열 중", run: async (s) => ({ answer: await polishDraft(client, s.raw, s.context) }) },
    { name: "finalize", label: "정리 중", run: (s) => ({ sources: selectSources(s.parts, s.raw) }) },
  ];

  // 인물 브리핑(A2)은 그래프와 '병렬'로(메인과 동일, 추가 지연 없음). offRegion 안내부는 초기 근거로 시드.
  const briefPromise = buildPersonBriefCard(c.env, query, offRegion);
  const initialParts: SourcePart[] = offRegion
    ? [{ text: "이 서비스는 충청남도 태안군 지역 정보만 제공합니다. 태안 외 지역의 날씨·시세·관광 데이터는 보유하지 않습니다.", source: { title: "안내 · 태안 전용 서비스", url: null } }]
    : [];

  return streamSSE(c, async (stream) => {
    try {
      const final = await runGraph(nodes, { parts: initialParts, context: "", raw: "", answer: "", sources: [] } as GState, async (e) => {
        await stream.writeSSE({ event: "progress", data: JSON.stringify({ node: e.name, label: e.label, phase: e.phase, pct: e.pct }) });
      });
      const withEvidence = c.req.query("evidence") === "1";
      const personBrief = await briefPromise;
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({
          answer: final.answer || tidyAnswer(final.raw),
          intent: "archive_rag",
          confidence: 0.9,
          fromCache: false,
          llmCalls,
          sources: final.sources,
          model: baseClient.model,
          ...(personBrief ? { personBrief } : {}),
          ...(withEvidence ? { evidence: final.parts.map((p, i) => ({ n: i + 1, source: p.source.title, text: p.text })) } : {}),
        }),
      });
    } catch {
      await stream.writeSSE({ event: "error", data: JSON.stringify("답변 생성에 실패했습니다.") });
    }
  });
});

// POST /api/query/_fact — 큐레이션 사실 upsert(관리자). {id,keywords,title,content,source}
queryRouter.post("/_fact", async (c) => {
  const env = c.env as Env & { ADMIN_TOKEN?: string };
  if (!env.ADMIN_TOKEN || c.req.header("X-Admin-Token") !== env.ADMIN_TOKEN) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id ?? "").trim();
  if (!id || !b.keywords || !b.title || !b.content) return c.json({ error: "id·keywords·title·content 필수" }, 400);
  const { upsertFact } = await import("./facts");
  await upsertFact(c.env.ARCHIVE_DB, {
    id, keywords: String(b.keywords), title: String(b.title), content: String(b.content), source: b.source ? String(b.source) : null,
  });
  return c.json({ ok: true, id });
});
