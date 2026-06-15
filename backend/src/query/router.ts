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

// 날씨·대기질 관련 질문인지 — 그러면 실시간 관측값을 근거로 추가
const WEATHER_RE = /날씨|기온|온도|미세먼지|초미세|대기질|미세|오존|황사|습도|비\b|강수|맑음|흐림|공기|먼지/;
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
            `WHERE archive_fts MATCH ? ORDER BY a.published_at DESC LIMIT 6`,
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
              "너는 태안 지역정보 도우미다. 아래 [근거](실시간 관측값·태안신문 기사)를 근거로 한국어로 답하라.\n" +
              "- 근거에서 질문과 관련된 내용을 최대한 종합해 구체적으로 답하라(수치·이름·날짜 포함).\n" +
              "- 실시간 관측값이 있으면 그 수치를 우선 사용하라.\n" +
              "- 일부만 있으면 그 부분을 답하고 '확인된 범위는 여기까지'처럼 한계를 덧붙여라.\n" +
              "- 근거가 질문과 '완전히' 무관할 때만 '해당 정보를 찾지 못했습니다'라고 하라.\n" +
              "- 근거에 없는 사실을 지어내지 마라. 답변 끝에 사용한 출처를 [번호]로 표기하라.",
          },
          { role: "user", content: `[근거]\n${context}\n\n[질문] ${query}` },
        ],
      });
      return c.json({
        answer: res.content,
        intent: "archive_rag",
        confidence: 0.9,
        fromCache: false,
        llmCalls: 1,
        sources: parts.map((p) => p.source),
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
