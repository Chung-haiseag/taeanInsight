import type { Metadata } from "next";
import { AILabelBadge } from "@/components/ai-label-badge";

export const metadata: Metadata = {
  title: "AI Query Agent",
  description: "자연어로 묻고 즉시 답을 받습니다",
};

const SUGGESTED_QUESTIONS = [
  "다음 주말 안면도 기상 예보 알려줘",
  "꽃지 해수욕장 일몰 시간은?",
  "태안 미세먼지 농도 추세는?",
  "안면읍 토지 시세 추이가 궁금해",
  "이번 주 태안 행사 일정",
];

export default function QueryPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <AILabelBadge kind="ai_assisted" />
          <span className="text-sm text-foreground-muted">캐싱 우선 · 출처 표기</span>
        </div>
        <h1 className="text-3xl font-bold text-brand">AI Query Agent</h1>
        <p className="text-foreground-muted">
          태안의 관광·환경·부동산에 대해 자연어로 물어보세요. 답변에는 항상 출처가 표기됩니다.
        </p>
      </header>

      {/* 질의 입력창 (자리표시) */}
      <section aria-labelledby="query-form-heading" className="border border-brand/15 rounded-lg p-6 bg-background">
        <h2 id="query-form-heading" className="sr-only">
          질의 입력
        </h2>
        <form className="flex flex-col gap-3">
          <label htmlFor="query-input" className="text-sm font-semibold text-brand">
            궁금한 것을 한국어로 입력하세요
          </label>
          <textarea
            id="query-input"
            name="query"
            rows={3}
            disabled
            placeholder="예: 다음 주말 안면도 해넘이 시간이 언제야?"
            className="border border-brand/20 rounded p-3 text-base resize-none focus:border-accent disabled:bg-foreground-muted/5"
            aria-describedby="query-help"
          />
          <p id="query-help" className="text-xs text-foreground-muted">
            💡 무료 사용자는 일 5회, B2B는 일 30회까지 질의할 수 있습니다.
            <br />
            🚧 백엔드 연결 전(REQ-PRODUCT-002 / TaskMaster #23) — UI 자리표시
          </p>
          <button
            type="submit"
            disabled
            className="self-end bg-brand text-background px-5 py-2 rounded font-semibold opacity-60 cursor-not-allowed"
          >
            질문하기
          </button>
        </form>
      </section>

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
                disabled
                className="w-full text-left border border-brand/15 rounded p-3 hover:border-brand/40 text-sm text-foreground-muted opacity-70 cursor-not-allowed"
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
