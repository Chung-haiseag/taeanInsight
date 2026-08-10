"use client";

// AI Query Agent — 자연어 질의 → 백엔드 RAG. 완성본 표시(스트리밍 끔): 서버가 근거 대조 교열까지
// 마친 정확본을 한 번에 반환하므로 눈앞에서 답이 바뀌지 않는다. REQ-PRODUCT-002 / TaskMaster #23.

import { useEffect, useState } from "react";

import { AILabelBadge } from "@/components/ai-label-badge";
import { Icon } from "@/components/icon";
import { ApiError, API_BASE_URL } from "@/lib/api/client";
import { askQuery, askQueryGraph, type QueryResult } from "@/lib/api/query";
import { getNews, type NewsItem } from "@/lib/api/news";
import { trackEvent } from "@/lib/api/reading";

import { AnswerView } from "./answer-view";
import { AnswerChart } from "./answer-chart";
import { MembershipNudge } from "@/components/membership-nudge";
import { decodeEntities } from "@/lib/decode-entities";
import { paragraphize } from "@/lib/paragraphize";
import { extractChartData } from "@/lib/chart-extract";
import { NewsPromo } from "./news-promo";
import { SearchProgress } from "./search-progress";

const SUGGESTED_QUESTIONS = [
  "다음 주말 안면도 기상 예보 알려줘",
  "꽃지 해수욕장 일몰 시간은?",
  "태안 미세먼지 농도 추세는?",
  "안면읍 토지 시세 추이가 궁금해",
  "이번 주 태안 행사 일정",
];

const INTENT_LABELS: Record<string, string> = {
  prediction: "예측",
  generation: "생성·요약",
  factcheck: "사실확인",
  other: "일반",
};

export function QueryClient() {
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState(""); // 실제로 던진 질문(인쇄 머리말용)
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<{ pct: number; label: string } | null>(null); // 그래프 실시간 진행
  // 대기 중 홍보용 태안신문 최신 소식 — 진입 시 미리 받아둔다(로딩 즉시 표시). 실패는 무시.
  const [promo, setPromo] = useState<{ items: NewsItem[]; labels: Record<string, string> }>({ items: [], labels: {} });
  useEffect(() => {
    getNews(undefined, 6)
      .then((r) => setPromo({ items: r.items ?? [], labels: r.labels ?? {} }))
      .catch(() => {});
  }, []);

  async function run(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setLive(null);
    setAsked(text);
    trackEvent("ai_query", text.slice(0, 120));

    // 기본 경로: 경량 그래프(노드별 실제 진행 + 완성본). 실패 시 비스트림으로 자동 폴백.
    let done = false;
    await askQueryGraph(
      { query: text },
      {
        onProgress: (p) => setLive({ pct: p.pct, label: p.label }),
        onDone: (r) => { done = true; setResult(r); setLoading(false); },
        onError: async () => {
          if (done) return;
          try {
            const res = await askQuery({ query: text }); // 폴백: 기존 비스트림
            setResult(res);
          } catch (e) {
            if (e instanceof ApiError) {
              setError(
                e.status === 503
                  ? "AI 엔진이 일시적으로 연결되지 않았습니다. 잠시 후 다시 시도해주세요."
                  : e.status === 400
                  ? "질문은 2자 이상 500자 이하로 입력해주세요."
                  : `요청 실패 (${e.status})`,
              );
            } else {
              setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
            }
          } finally {
            setLoading(false);
          }
        },
      },
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void run(query);
  }

  function onSuggest(q: string) {
    setQuery(q);
    void run(q);
  }

  // PDF 저장 — 답은 서버에서 이미 교열된 정확본이므로 그대로 인쇄한다.
  //   근거를 모두 펼치고 인쇄. 워터마크·페이지여백은 전역 print CSS가 담당.
  function savePdf() {
    if (!result) return;
    document
      .querySelectorAll<HTMLDetailsElement>(".answer-print details")
      .forEach((d) => { d.open = true; });
    window.setTimeout(() => window.print(), 80);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2 no-print">
        <div className="flex items-center gap-2">
          <AILabelBadge kind="ai_assisted" />
          <span className="text-sm text-foreground-muted">정확한 답변 · 출처 표기</span>
        </div>
        <h1 className="text-3xl font-bold text-brand">무엇이든 물어보세요</h1>
        <p className="text-foreground-muted">
          태안의 관광·환경·부동산에 대해 자연어로 물어보세요. 답변에는 항상 출처가 표기됩니다.
        </p>
      </header>

      {/* 질의 입력창 */}
      <section aria-labelledby="query-form-heading" className="no-print border border-brand/15 rounded-lg p-6 bg-background">
        <h2 id="query-form-heading" className="sr-only">
          질의 입력
        </h2>
        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          <label htmlFor="query-input" className="text-sm font-semibold text-brand">
            궁금한 것을 한국어로 입력하세요
          </label>
          <textarea
            id="query-input"
            name="query"
            rows={3}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(e);
            }}
            disabled={loading}
            placeholder="예: 다음 주말 안면도 해넘이 시간이 언제야?"
            className="border border-brand/20 rounded p-3 text-base resize-none focus:border-accent disabled:bg-foreground-muted/5"
            aria-describedby="query-help"
            maxLength={500}
          />
          <p id="query-help" className="text-xs text-foreground-muted">
            <Icon name="idea" /> ⌘/Ctrl+Enter로 전송
          </p>
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="self-end bg-brand text-background px-5 py-2 rounded font-semibold disabled:opacity-60 disabled:cursor-not-allowed hover:bg-brand/90 transition-colors"
          >
            {loading ? "답변 생성 중…" : "질문하기"}
          </button>
        </form>
      </section>

      {/* 검색·생성 진행 표시 + 대기 중 태안신문 최신 소식 홍보 */}
      {loading && (
        <div className="no-print space-y-4">
          <SearchProgress livePct={live ? live.pct : undefined} liveLabel={live?.label} />
          <NewsPromo items={promo.items} labels={promo.labels} />
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div role="alert" className="no-print border border-red-300 bg-red-50 text-red-800 rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      {/* 완성 답변 (인쇄/PDF 대상) */}
      {result && (
        <section
          aria-labelledby="answer-heading"
          className="answer-print border border-accent/30 rounded-lg p-6 bg-accent/5 space-y-4"
        >
          {/* 인쇄 전용 머리말 — 화면에선 숨김 */}
          <div className="hidden print:block mb-2">
            <p className="text-xs text-foreground-muted">태안 인사이트 · AI 답변</p>
            <h2 className="text-xl font-bold text-brand">{asked}</h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <AILabelBadge kind="ai_assisted" />
            <span className="text-xs text-foreground-muted">
              {INTENT_LABELS[result.intent] ?? result.intent}
              {result.fromCache ? " · 캐시" : ` · LLM ${result.llmCalls}회`}
            </span>
            <button
              type="button"
              onClick={savePdf}
              title="근거를 펼쳐 PDF로 저장"
              className="no-print ml-auto inline-flex items-center gap-1 rounded border border-brand/25 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/5 transition-colors"
            >
              <Icon name="download" /> PDF로 저장
            </button>
          </div>
          <h2 id="answer-heading" className="sr-only">
            답변
          </h2>
          <AnswerView text={result.answer} />

          {/* 답변 속 수치를 자동으로 막대 차트로(월별·연도별 등). 뽑을 게 없으면 표시 안 함 */}
          {extractChartData(result.answer).map((spec, i) => (
            <AnswerChart key={i} spec={spec} />
          ))}

          {result.personBrief && (
            <div className="rounded-lg border border-brand/20 bg-background p-4 text-sm leading-relaxed">
              <p className="mb-2 text-xs font-semibold text-brand">
                👤 {result.personBrief.name} — AI 인물 브리핑
                <span className="ml-1 font-normal text-foreground-muted">· 아카이브 기사 요약(검증된 사실 아님)</span>
              </p>
              <div className="flex gap-3">
                {result.personBrief.photo && (
                  <figure className="shrink-0 text-center break-inside-avoid">
                    {/* 역대 군수 공식 사진(태안군청). 검증된 항목이므로 AI 요약과 시각적으로 구분 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${API_BASE_URL}${result.personBrief.photo}`}
                      alt={`${result.personBrief.name} 태안군수 공식 사진`}
                      className="w-24 rounded border border-brand/15 bg-foreground-muted/5"
                      loading="lazy"
                    />
                    <figcaption className="mt-1 text-[10px] text-foreground-muted">태안군청 공식</figcaption>
                  </figure>
                )}
                <p className="flex-1 whitespace-pre-wrap">{decodeEntities(result.personBrief.text)}</p>
              </div>
            </div>
          )}

          {result.sources.length > 0 && (
            <div className="pt-2 border-t border-accent/20">
              <h3 className="text-sm font-semibold text-brand mb-2">출처</h3>
              <ul className="space-y-1 text-sm">
                {result.sources.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {s.kind === "web" && (
                      <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                        웹{(() => { try { return " · " + new URL(s.url ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } })()}
                      </span>
                    )}
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                        {s.title}
                      </a>
                    ) : (
                      <span>{s.title}</span>
                    )}
                    {s.publishedAt && <span className="text-xs text-foreground-muted">· {s.publishedAt}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.evidence && result.evidence.length > 0 && (
            <details className="pt-2 border-t border-accent/20" open>
              <summary className="cursor-pointer text-sm font-semibold text-brand">
                <Icon name="search" /> 참고한 근거 {result.evidence.length}건
              </summary>
              <ul className="mt-3 space-y-3">
                {result.evidence.map((e) => (
                  <li key={e.n} className="rounded-lg border border-brand/10 bg-background p-4 text-sm break-inside-avoid">
                    <p className="font-semibold text-brand mb-1.5">
                      [{e.n}] {decodeEntities(e.source)}
                    </p>
                    <div className="space-y-2 leading-relaxed text-foreground-muted">
                      {paragraphize(decodeEntities(e.text)).map((para, k) => (
                        <p key={k}>{para}</p>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-foreground-muted">
                AI는 위 실시간·아카이브 근거를 바탕으로 답합니다(없으면 “찾지 못함”). 사실은 공공데이터·기록, 문장은 AI.
              </p>
            </details>
          )}
          <p className="text-xs text-foreground-muted">
            ⚠️ AI 생성 답변입니다. 중요한 결정 전에는 출처와 원문을 확인하세요.
          </p>
          <MembershipNudge
            source="query"
            title="답을 찾으셨나요?"
            subtitle="더 깊은 분석과 내 관심사·내 가게 맞춤 정보는 멤버십에서. 사전 신청자는 첫 달 무료."
          />
        </section>
      )}

      {/* 추천 질의 */}
      <section aria-labelledby="suggested-heading" className="no-print">
        <h2 id="suggested-heading" className="text-lg font-bold text-brand mb-3">
          추천 질문
        </h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onSuggest(q)}
                disabled={loading}
                className="w-full text-left border border-brand/15 rounded p-3 hover:border-brand/40 text-sm text-foreground disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
