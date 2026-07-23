"use client";

// AI Query Agent — 자연어 질의 → 백엔드 LangGraph Lite(라우터→예측/생성) 실시간 연결
// REQ-PRODUCT-002 / TaskMaster #23. LLM 경로: Workers AI 무료 모델(종량 0).

import { useState } from "react";

import { AILabelBadge } from "@/components/ai-label-badge";
import { Icon } from "@/components/icon";
import { ApiError } from "@/lib/api/client";
import { askQuery, type QueryResult } from "@/lib/api/query";
import { trackEvent } from "@/lib/api/reading";

import { AnswerView } from "./answer-view";
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
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      trackEvent("ai_query", text.slice(0, 120));
      const res = await askQuery({ query: text });
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
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void run(query);
  }

  function onSuggest(q: string) {
    setQuery(q);
    void run(q);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <AILabelBadge kind="ai_assisted" />
          <span className="text-sm text-foreground-muted">빠른 답변 · 출처 표기</span>
        </div>
        <h1 className="text-3xl font-bold text-brand">무엇이든 물어보세요</h1>
        <p className="text-foreground-muted">
          태안의 관광·환경·부동산에 대해 자연어로 물어보세요. 답변에는 항상 출처가 표기됩니다.
        </p>
      </header>

      {/* 질의 입력창 */}
      <section aria-labelledby="query-form-heading" className="border border-brand/15 rounded-lg p-6 bg-background">
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
            <Icon name="idea" /> 무료 사용자는 일 5회, B2B는 일 30회까지 질의할 수 있습니다. (⌘/Ctrl+Enter 전송)
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

      {/* 검색 진행 표시 */}
      {loading && <SearchProgress />}

      {/* 에러 */}
      {error && (
        <div role="alert" className="border border-red-300 bg-red-50 text-red-800 rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      {/* 답변 */}
      {result && (
        <section aria-labelledby="answer-heading" className="border border-accent/30 rounded-lg p-6 bg-accent/5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <AILabelBadge kind="ai_assisted" />
            <span className="text-xs text-foreground-muted">
              {INTENT_LABELS[result.intent] ?? result.intent}
              {result.fromCache ? " · 캐시" : ` · LLM ${result.llmCalls}회`}
            </span>
          </div>
          <h2 id="answer-heading" className="sr-only">
            답변
          </h2>
          <AnswerView text={result.answer} />

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
            <details className="pt-2 border-t border-accent/20">
              <summary className="cursor-pointer text-sm font-semibold text-brand">
                <Icon name="search" /> 참고한 실시간 근거 {result.evidence.length}건
              </summary>
              <ul className="mt-2 space-y-2">
                {result.evidence.map((e) => (
                  <li key={e.n} className="rounded-lg border border-brand/10 bg-background p-3 text-xs">
                    <p className="font-semibold text-brand">[{e.n}] {e.source}</p>
                    <p className="mt-1 whitespace-pre-wrap text-foreground-muted">{e.text}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-foreground-muted">
                AI는 위 실시간 데이터를 근거로만 답합니다(없으면 “찾지 못함”). 사실은 공공데이터, 문장은 AI.
              </p>
            </details>
          )}
          <p className="text-xs text-foreground-muted">
            ⚠️ AI 생성 답변입니다. 중요한 결정 전에는 출처와 원문을 확인하세요.
          </p>
        </section>
      )}

      {/* 추천 질의 */}
      <section aria-labelledby="suggested-heading">
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
