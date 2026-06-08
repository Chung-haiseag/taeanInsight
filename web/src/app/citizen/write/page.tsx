"use client";

// 시민 코파일럿 에디터 (MVP)
//  · 작성 중 실시간 거버넌스 점검(PII·민감주제) — 무LLM
//  · AI 라벨 + 출처
//  · 제출 → 거버넌스 적용 → AI 라벨 산정 → HITL 검수 큐
// AI 글쓰기 보조(다듬기·요약·관련기사)는 다음 단계(Workers AI/Claude·아카이브 RAG)

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  copilotAssist,
  copilotCheck,
  copilotSubmit,
  PII_LABELS,
  SENSITIVE_LABELS,
  type AiLabel,
  type AssistMode,
  type CheckResult,
  type SubmitResult,
} from "@/lib/api/copilot";

export default function CopilotEditorPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [aiLabel, setAiLabel] = useState<AiLabel>("human");
  const [source, setSource] = useState("");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 디바운스 실시간 점검
  useEffect(() => {
    if (!title && !body) {
      setCheck(null);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        setCheck(await copilotCheck(title, body));
      } catch {
        /* 점검 실패는 조용히 무시 */
      }
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [title, body]);

  async function submit() {
    setSubmitting(true);
    setResult(null);
    try {
      const r = await copilotSubmit({
        title,
        body,
        aiLabel,
        sources: source ? [{ title: source }] : [],
        reporterId: "cr-01",
      });
      setResult(r);
    } catch (e) {
      setResult({
        ok: false,
        queued: false,
        reviewId: "",
        aiLabel,
        aiLabelText: "",
        publishAllowed: false,
        reasons: [e instanceof Error ? e.message : "제출 실패"],
        message: "제출에 실패했습니다.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const needSource = aiLabel !== "human" && !source;
  const canSubmit = title.trim() && body.trim() && !needSource && !submitting;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">
          <span className="inline-block w-6 h-px bg-accent" aria-hidden="true" />
          Citizen Co-Pilot
        </p>
        <h1 className="mt-3 text-display-sm font-bold text-brand">시민기자 에디터</h1>
        <p className="mt-1 text-foreground-muted">
          AI가 사실·맥락 확인과 거버넌스를 돕고, 편집부가 모든 글을 검토(HITL)합니다.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 에디터 */}
        <div className="space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="기사 제목"
            aria-label="기사 제목"
            className="w-full border-b-2 border-brand/15 bg-transparent pb-2 text-2xl font-bold text-brand outline-none focus:border-accent"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="본문을 입력하세요. 작성하는 동안 개인정보·민감주제를 실시간으로 확인합니다."
            aria-label="기사 본문"
            rows={18}
            className="w-full resize-y rounded-lg border border-brand/15 bg-background p-4 leading-relaxed outline-none focus:border-accent"
          />

          {/* AI 라벨 + 출처 */}
          <div className="rounded-lg border border-brand/15 bg-background p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-brand mb-1.5">AI 사용 정도 (라벨)</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["human", "사람 작성"],
                    ["ai_assisted", "AI 보조"],
                    ["ai_generated", "AI 생성"],
                  ] as [AiLabel, string][]
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAiLabel(v)}
                    aria-pressed={aiLabel === v}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      aiLabel === v ? "bg-brand text-background" : "border border-brand/20 text-foreground-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {aiLabel !== "human" && (
              <div>
                <label className="text-sm font-semibold text-brand">출처 (AI 보조·생성 시 필수)</label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="예: 태안군 보도자료 / 현장 취재"
                  className="mt-1 w-full rounded border border-brand/20 px-2 py-1.5 text-sm"
                />
              </div>
            )}
          </div>

          <button type="button" onClick={submit} disabled={!canSubmit} className="btn-accent disabled:opacity-50">
            {submitting ? "제출 중…" : "편집부에 제출 (HITL 검수)"}
          </button>
          {needSource && <p className="text-xs text-amber-600">AI 보조·생성 기사는 출처가 필요합니다.</p>}

          {result && <SubmitPanel result={result} />}
        </div>

        {/* 코파일럿 사이드 */}
        <aside className="space-y-4">
          <GovernancePanel check={check} />
          <AssistPanel body={body} onApply={(t) => setBody(t)} />
        </aside>
      </div>
    </div>
  );
}

function GovernancePanel({ check }: { check: CheckResult | null }) {
  const clean = check && check.pii.count === 0 && check.sensitive.topics.length === 0;
  return (
    <section className="rounded-2xl border border-brand/15 bg-background p-4 space-y-3">
      <h2 className="text-sm font-bold text-brand">🛡️ 실시간 점검</h2>
      {!check && <p className="text-xs text-foreground-muted">작성을 시작하면 개인정보·민감주제를 확인합니다.</p>}
      {check && clean && <p className="text-sm text-green-700">✅ 감지된 위험 없음</p>}
      {check && !clean && (
        <div className="space-y-2">
          {check.pii.count > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs">
              <p className="font-semibold text-amber-800">개인정보 {check.pii.count}건</p>
              <p className="text-amber-700">{check.pii.kinds.map((k) => PII_LABELS[k] ?? k).join(", ")} · 발행 시 자동 마스킹</p>
            </div>
          )}
          {check.sensitive.topics.map((t) => (
            <div key={t.topic} className="rounded border border-red-200 bg-red-50 p-2.5 text-xs">
              <p className="font-semibold text-red-700">민감주제: {SENSITIVE_LABELS[t.topic] ?? t.topic}</p>
              <p className="text-red-600">키워드: {t.matched.join(", ")}</p>
            </div>
          ))}
          {check.sensitive.blockAiOnly && (
            <p className="text-xs font-semibold text-red-700">⚠️ AI 단독 발행 차단 — 편집장 직접 작성 필요</p>
          )}
          {check.sensitive.requiresHitl && !check.sensitive.blockAiOnly && (
            <p className="text-xs font-semibold text-amber-700">⚠️ 편집부 검토(HITL) 필수</p>
          )}
        </div>
      )}
      {check && <p className="text-[11px] text-foreground-muted">{check.chars}자 · 규칙 기반(무LLM)</p>}
    </section>
  );
}

function AssistPanel({ body, onApply }: { body: string; onApply: (text: string) => void }) {
  const [busy, setBusy] = useState<AssistMode | null>(null);
  const [out, setOut] = useState<{ mode: AssistMode; result: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(mode: AssistMode) {
    if (!body.trim()) {
      setErr("본문을 먼저 입력하세요.");
      return;
    }
    setBusy(mode);
    setErr(null);
    setOut(null);
    try {
      const r = await copilotAssist(mode, body);
      setOut({ mode, result: r.result });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "보조 실패");
    } finally {
      setBusy(null);
    }
  }

  const buttons: [AssistMode, string][] = [
    ["polish", "✍️ 다듬기"],
    ["summarize", "📝 요약"],
    ["title", "💡 제목 추천"],
  ];

  return (
    <section className="rounded-2xl border border-brand/15 bg-background p-4 space-y-3">
      <h2 className="text-sm font-bold text-brand">🤖 AI 글쓰기 보조</h2>
      <div className="flex flex-wrap gap-2">
        {buttons.map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => run(mode)}
            disabled={busy !== null}
            className="rounded-full border border-brand/20 px-3 py-1.5 text-sm text-brand hover:bg-brand/5 disabled:opacity-50"
          >
            {busy === mode ? "생성 중…" : label}
          </button>
        ))}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      {out && (
        <div className="rounded-lg border border-accent/30 bg-accent-subtle/20 p-3 space-y-2">
          <p className="whitespace-pre-wrap text-sm text-foreground">{out.result}</p>
          {out.mode === "polish" && (
            <button
              type="button"
              onClick={() => onApply(out.result)}
              className="text-xs font-semibold text-accent hover:underline"
            >
              본문에 반영 →
            </button>
          )}
        </div>
      )}
      <p className="text-[11px] text-foreground-muted">Workers AI (Llama 3.1) · 무료 할당 내 종량 0 · 관련 과거기사·팩트체크는 아카이브 백필 후</p>
    </section>
  );
}

function SubmitPanel({ result }: { result: SubmitResult }) {
  return (
    <div
      className={`rounded-2xl border p-5 space-y-2 ${
        result.queued ? "border-accent/40 bg-accent-subtle/20" : "border-red-200 bg-red-50"
      }`}
    >
      <p className="font-semibold text-brand">
        {result.queued ? "✅ 검수 큐에 등록됨" : "제출 결과"}
      </p>
      {result.aiLabelText && (
        <p className="text-sm">
          AI 라벨: <strong className="text-brand">{result.aiLabelText}</strong> · 발행 가능:{" "}
          {result.publishAllowed ? "예" : "보류(편집부 검토 후)"}
        </p>
      )}
      <p className="text-sm text-foreground-muted">{result.message}</p>
      {result.reasons.length > 0 && (
        <ul className="text-xs text-foreground-muted list-disc pl-4">
          {result.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <Link href="/admin" className="inline-block text-sm font-semibold text-accent hover:underline">
        편집부 검수 큐 보기 →
      </Link>
    </div>
  );
}
