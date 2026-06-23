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

// 날씨·대기질 관련 질문인지 — 그러면 실시간 관측값을 근거로 추가
const WEATHER_RE = /날씨|기온|온도|미세먼지|초미세|대기질|미세|오존|황사|습도|비\b|강수|맑음|흐림|공기|먼지/;
// 부동산·실거래 질문이면 국토부 실거래가를 근거로 추가
const REALESTATE_RE = /부동산|토지|시세|실거래|아파트|땅값|평당|매매|전세|임대|분양|집값/;
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

// 질문에서 핵심 키워드 추출 → 아카이브(FTS5 우선, LIKE 폴백)에서 근거 기사 검색
const QUERY_STOP = new Set([
  "알려줘", "알려", "주세요", "관해서", "관하여", "대해서", "대하여", "대해", "무엇", "어떤", "어떻게",
  "현황", "정보", "궁금해", "궁금", "관련", "입니다", "인가", "무슨", "그리고", "에서", "에게", "으로",
  "저것", "이것", "그것", "있나", "있는", "되나", "보여줘", "찾아줘",
]);
async function retrieveArchive(
  db: D1Database,
  query: string,
): Promise<Array<{ idxno: number; title: string; published_at: string; body: string }>> {
  const tokens = [
    ...new Set(
      query
        .replace(/[^가-힣0-9a-zA-Z]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 2 && !QUERY_STOP.has(t)),
    ),
  ];
  if (!tokens.length) return [];
  const cols = "a.idxno, a.title, a.published_at, substr(a.body,1,1300) AS body";
  // FTS5(트라이그램)는 3글자 이상만 매칭 — 특정 키워드는 FTS, 없으면 가장 긴 토큰 LIKE
  const ftsTokens = tokens.filter((t) => t.length >= 3).map((t) => `"${t.replace(/"/g, "")}"`);
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
  const kw = `%${tokens.sort((a, b) => b.length - a.length)[0]}%`;
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

    // (a) 날씨·대기질 질문이면 실시간 관측값을 근거에 추가
    if (WEATHER_RE.test(query) && c.env.DATA_GO_KR_KEY) {
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
    }

    // (a-2) 부동산·실거래 질문이면 국토부 실거래가를 근거에 추가(읍·면 필터 + ㎡당 단가·월별 추이·전체 대비)
    if (REALESTATE_RE.test(query) && c.env.DATA_GO_KR_KEY) {
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

    // (b) 아카이브·태안뉴스 근거 검색 — 단, 순수 날씨 질문이면 기사 출처는 생략
    if (c.env.ARCHIVE_DB && !isPureWeather(query)) {
      const rows = await retrieveArchive(c.env.ARCHIVE_DB, query);
      for (const r of rows) {
        parts.push({ text: `${r.title} (${String(r.published_at).slice(0, 10)})\n${r.body}`, source: { title: r.title, url: `/news/${r.idxno}`, publishedAt: r.published_at } });
      }
    }

    if (parts.length) {
      const context = parts.map((p, i) => `[${i + 1}] ${p.text}`).join("\n\n");
      const res = await client.complete({
        channel: "realtime",
        maxTokens: 800,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "너는 태안 지역정보 도우미다. 아래 [근거](실시간 관측값·국토부 실거래·태안신문 기사)를 근거로 한국어로 충실히 답하라.\n" +
              "- 근거의 수치를 최대한 활용해 구체적이고 충분한 분량(3~6문장)으로 답하라. 한 줄로 끝내지 마라.\n" +
              "- 부동산 질문이면 ㎡당 평균 단가·거래 건수·기간·월별 추이·태안군 전체 대비를 종합해 '시세 흐름'을 설명하라.\n" +
              "- 표본이 적으면 '거래가 N건으로 적어 추세 단정은 어렵다'처럼 한계를 함께 밝히되, 있는 데이터는 모두 활용하라.\n" +
              "- 실시간 관측값이 있으면 그 수치를 우선 사용하라.\n" +
              "- 근거가 질문과 '완전히' 무관할 때만 '해당 정보를 찾지 못했습니다'라고 하라.\n" +
              "- 근거에 없는 사실을 지어내지 마라. 답변 끝에 사용한 출처를 [번호]로 표기하라.",
          },
          { role: "user", content: `[근거]\n${context}\n\n[질문] ${query}` },
        ],
      });
      // 출처는 답변이 실제로 사용한 것만 노출(무관 기사 더미 방지).
      const answer = res.content;
      const notFound = /찾지 못했|찾을 수 없|정보가 없|정보를 찾지|확인되지 않/.test(answer);
      let sources = parts.map((p) => p.source);
      if (notFound) {
        // 못 찾음 → 공식 실시간·실거래 근거(url 없음)만 남기고 무관 기사 출처 제거
        sources = parts.filter((p) => p.source.url === null).map((p) => p.source);
      } else {
        const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
        if (cited.size) sources = parts.filter((_, i) => cited.has(i + 1)).map((p) => p.source);
      }
      return c.json({
        answer,
        intent: "archive_rag",
        confidence: 0.9,
        fromCache: false,
        llmCalls: 1,
        sources,
        model: client.model,
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
