"use client";

// 관리자(운영자) 대시보드
// 비용 모니터링 + HITL 검수 큐는 실데이터 연동, 나머지 섹션은 백엔드 구현 대기 자리표시.
// 연관 TaskMaster: #19(비용·완료), #26(HITL 검수·연동), #29(시민기자 정산), AI 거버넌스(#27)

import { useEffect, useState } from "react";

import { AILabelBadge } from "@/components/ai-label-badge";
import { getCostSummary, type MonthlyCostReport } from "@/lib/api/admin";
import {
  decideReview,
  getReviewQueue,
  PII_KIND_LABELS,
  SENSITIVE_TOPIC_LABELS,
  type ReviewItem,
  type ReviewStats,
} from "@/lib/api/review";
import {
  getReporters,
  paySettlement,
  SETTLEMENT_STATUS_LABELS,
  type CitizenSummary,
  type ReporterSummary,
  type SettlementStatus,
} from "@/lib/api/citizen";
import { REGION_OPTIONS } from "@/lib/types";

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded bg-brand px-2 py-0.5 text-xs font-semibold text-background">
            관리자 전용
          </span>
          <span className="text-sm text-foreground-muted">내부 운영 도구 · 외부 노출 금지</span>
        </div>
        <h1 className="text-3xl font-bold text-brand">관리자 대시보드</h1>
        <p className="text-foreground-muted">
          비용 감시 · AI 콘텐츠 검수 · 시민기자 운영을 한곳에서. 비용·HITL 검수·시민기자 운영은 실데이터와
          연동되며, 민감주제 규칙 편집만 백엔드 연결 대기 중입니다.
        </p>
        <div className="bg-accent-subtle/40 border border-accent rounded-lg p-3 text-sm text-foreground-muted">
          🔒 <strong className="text-brand">인증 미적용 (데모)</strong> — 실제 운영 시 SSO + 관리자 권한 검사가
          필요합니다. (TaskMaster #21 / #26)
        </div>
      </header>

      <CostMonitorSection />
      <ReviewQueueSection />
      <CitizenOpsSection />
      <GovernanceSection />
    </div>
  );
}

// ── 1. 비용 모니터링 (실데이터) ─────────────────────────────
function CostMonitorSection() {
  const [report, setReport] = useState<MonthlyCostReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setReport(await getCostSummary());
      } catch (e) {
        setError(e instanceof Error ? e.message : "비용 데이터를 불러오지 못했습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section aria-labelledby="cost-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="cost-heading" className="text-xl font-bold text-brand">
          💰 비용 모니터링
        </h2>
        <span className="text-xs text-foreground-muted">실시간 · 매시간 cron 집계</span>
      </div>

      {loading && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {error && (
        <p className="text-sm text-red-600 border border-red-200 rounded p-3 bg-red-50">
          ⚠️ {error} (백엔드 API 연결을 확인하세요)
        </p>
      )}

      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="이번 달" value={report.month} />
            <Stat label="누적 비용" value={`₩${report.totalKrw.toLocaleString()}`} />
            <Stat label="월 한도" value={`₩${report.limitKrw.toLocaleString()}`} />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-foreground-muted">
              <span>한도 사용률</span>
              <span>{Math.round(report.ratio * 100)}%</span>
            </div>
            <div
              className="h-3 w-full rounded bg-brand/10 overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(report.ratio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded ${report.ratio >= 0.9 ? "bg-red-500" : report.ratio >= 0.7 ? "bg-amber-500" : "bg-accent"}`}
                style={{ width: `${Math.min(100, Math.round(report.ratio * 100))}%` }}
              />
            </div>
            {report.thresholdsCrossed.length > 0 && (
              <p className="text-xs text-red-600">
                ⚠️ 임계값 초과: {report.thresholdsCrossed.map((t) => `${t * 100}%`).join(", ")}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ── 2. AI 콘텐츠 검수 큐 (HITL, 실데이터) ────────────────────
function ReviewQueueSection() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { items, stats } = await getReviewQueue();
        setItems(items);
        setStats(stats);
      } catch (e) {
        setError(e instanceof Error ? e.message : "검수 큐를 불러오지 못했습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    // 낙관적 로컬 반영 (Workers 인메모리는 요청 간 영속되지 않음)
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: decision } : it)));
    setStats((prev) =>
      prev ? { ...prev, pending: Math.max(0, prev.pending - 1), [decision]: prev[decision] + 1 } : prev,
    );
    try {
      await decideReview(id, decision);
    } catch {
      /* 데모: 실패해도 로컬 반영 유지 */
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="review-heading" className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 id="review-heading" className="text-xl font-bold text-brand">
          🛡️ AI 콘텐츠 검수 큐 (HITL)
        </h2>
        <AILabelBadge kind="ai_assisted" />
        {stats && (
          <span className="text-xs text-foreground-muted">
            대기 {stats.pending} · 승인 {stats.approved} · 반려 {stats.rejected}
          </span>
        )}
      </div>
      <p className="text-sm text-foreground-muted">
        거버넌스 파이프라인이 PII·민감주제로 표시한 콘텐츠입니다. 승인/반려하세요.
      </p>

      {loading && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {error && (
        <p className="text-sm text-red-600 border border-red-200 rounded p-3 bg-red-50">⚠️ {error}</p>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {items.map((it) => (
            <article key={it.id} className="border border-brand/15 rounded-lg p-4 bg-background space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-brand truncate">{it.title}</p>
                  <p className="text-xs text-foreground-muted">
                    {it.resourceType} · {it.resourceId}
                  </p>
                </div>
                <StatusPill status={it.status} />
              </div>

              <p className="text-sm text-foreground-muted line-clamp-2">{it.excerpt}</p>

              <div className="flex flex-wrap gap-1.5">
                <AILabelBadge kind={it.aiLabel} />
                {it.sensitiveTopics.map((t) => (
                  <Tag key={t} tone="danger">
                    {SENSITIVE_TOPIC_LABELS[t] ?? t}
                  </Tag>
                ))}
                {it.piiKinds.map((k) => (
                  <Tag key={k} tone="warn">
                    PII·{PII_KIND_LABELS[k] ?? k}
                  </Tag>
                ))}
                {it.blockAiOnly && <Tag tone="danger">AI 단독 차단</Tag>}
              </div>

              {it.status === "pending" ? (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => decide(it.id, "approved")}
                    disabled={busyId === it.id}
                    className="bg-brand text-background px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-60"
                  >
                    승인
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(it.id, "rejected")}
                    disabled={busyId === it.id}
                    className="border border-red-300 text-red-600 px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-60"
                  >
                    반려
                  </button>
                </div>
              ) : (
                <p className="text-xs text-foreground-muted pt-1">
                  {it.reviewerId ? `검토자 ${it.reviewerId}` : "처리됨"}
                  {it.decisionReason ? ` · ${it.decisionReason}` : ""}
                </p>
              )}
            </article>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-foreground-muted px-3 py-8 text-center border border-brand/15 rounded-lg">
              검수 대기 항목이 없습니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: ReviewItem["status"] }) {
  const map = {
    pending: { text: "검수 대기", cls: "bg-amber-100 text-amber-800" },
    approved: { text: "승인", cls: "bg-green-100 text-green-800" },
    rejected: { text: "반려", cls: "bg-red-100 text-red-700" },
  } as const;
  const s = map[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.text}</span>;
}

function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" | "danger" }) {
  const cls =
    tone === "danger"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-brand/5 text-foreground-muted border-brand/15";
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}

// ── 3. 시민기자 운영 (실데이터) ─────────────────────────────
function regionLabel(code: string): string {
  return REGION_OPTIONS.find((r) => r.code === code)?.label ?? code;
}

function CitizenOpsSection() {
  const [reporters, setReporters] = useState<ReporterSummary[]>([]);
  const [summary, setSummary] = useState<CitizenSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { reporters, summary } = await getReporters();
        setReporters(reporters);
        setSummary(summary);
      } catch (e) {
        setError(e instanceof Error ? e.message : "시민기자 데이터를 불러오지 못했습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function pay(reporterId: string) {
    setBusyId(reporterId);
    // 낙관적 로컬 반영 (Workers 인메모리는 요청 간 영속 안 됨)
    setReporters((prev) =>
      prev.map((r) =>
        r.userId === reporterId && r.settlement
          ? { ...r, settlement: { ...r.settlement, status: "paid" } }
          : r,
      ),
    );
    setSummary((prev) => (prev ? { ...prev, pendingSettlements: Math.max(0, prev.pendingSettlements - 1) } : prev));
    try {
      await paySettlement(reporterId);
    } catch {
      /* 데모: 실패해도 로컬 반영 유지 */
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="citizen-heading" className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 id="citizen-heading" className="text-xl font-bold text-brand">
          📰 시민기자 운영
        </h2>
        {summary && (
          <span className="text-xs text-foreground-muted">
            기자 {summary.totalReporters}명(활동 {summary.active}) · 발행 {summary.publishedTotal} ·{" "}
            {summary.settlementMonth} 정산 ₩{summary.settlementTotalKrw.toLocaleString()}(대기{" "}
            {summary.pendingSettlements})
          </span>
        )}
      </div>
      <p className="text-sm text-foreground-muted">
        ℹ️ 실제 모집은 2026년 7월 중순 예정 — 아래는 운영 화면 <strong>예시 데이터</strong>입니다.
      </p>

      {loading && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {error && (
        <p className="text-sm text-red-600 border border-red-200 rounded p-3 bg-red-50">⚠️ {error}</p>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto border border-brand/15 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand/5 text-left text-foreground-muted">
                <th className="px-3 py-2 font-semibold">기자</th>
                <th className="px-3 py-2 font-semibold">발행</th>
                <th className="px-3 py-2 font-semibold">교육</th>
                <th className="px-3 py-2 font-semibold">이번 달 정산</th>
                <th className="px-3 py-2 font-semibold">처리</th>
              </tr>
            </thead>
            <tbody>
              {reporters.map((r) => (
                <tr key={r.userId} className="border-t border-brand/10">
                  <td className="px-3 py-2">
                    <span className="font-semibold text-brand">{r.name}</span>
                    <span className="text-xs text-foreground-muted"> · {regionLabel(r.eupMyeon)}</span>
                    {!r.active && <span className="ml-1 text-xs text-red-500">중단</span>}
                    {!r.onboardingCompleted && <span className="ml-1 text-xs text-amber-600">교육 미완</span>}
                  </td>
                  <td className="px-3 py-2">{r.publishedCount}건</td>
                  <td className="px-3 py-2">
                    <TrainingBar completed={r.trainingCompleted} />
                  </td>
                  <td className="px-3 py-2">
                    {r.settlement ? (
                      <span>
                        ₩{r.settlement.totalKrw.toLocaleString()}
                        {r.settlement.bonusKrw > 0 && (
                          <span className="text-xs text-accent"> (+보너스)</span>
                        )}{" "}
                        <SettlementPill status={r.settlement.status} />
                      </span>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.settlement && r.settlement.status !== "paid" ? (
                      <button
                        type="button"
                        onClick={() => pay(r.userId)}
                        disabled={busyId === r.userId}
                        className="bg-brand text-background px-3 py-1 rounded text-xs font-semibold disabled:opacity-60"
                      >
                        정산 처리
                      </button>
                    ) : (
                      <span className="text-xs text-foreground-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TrainingBar({ completed }: { completed: number }) {
  const total = 6;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block w-16 h-2 rounded bg-brand/10 overflow-hidden">
        <span
          className={`block h-full ${completed >= total ? "bg-accent" : "bg-amber-400"}`}
          style={{ width: `${(completed / total) * 100}%` }}
        />
      </span>
      <span className="text-xs text-foreground-muted">
        {completed}/{total}
      </span>
    </span>
  );
}

function SettlementPill({ status }: { status: SettlementStatus }) {
  const map = {
    pending: "bg-amber-100 text-amber-800",
    processing: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-700",
  } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>
      {SETTLEMENT_STATUS_LABELS[status]}
    </span>
  );
}

// ── 4. 거버넌스 설정 (자리표시) ─────────────────────────────
function GovernanceSection() {
  return (
    <PlaceholderSection
      id="governance"
      title="⚠️ 민감주제 규칙"
      task="#27"
      desc="선거·범죄·의료 등 민감주제 차단 규칙(현재 7종 시드)을 편집팀이 추가/수정합니다."
      columns={["주제", "키워드", "차단 동작"]}
    />
  );
}

// ── 공용 컴포넌트 ───────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border border-brand/15 rounded-lg p-4 bg-background">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="text-2xl font-bold text-brand mt-1">{value}</p>
    </article>
  );
}

function PlaceholderSection({
  id,
  title,
  desc,
  columns,
  task,
  badge,
}: {
  id: string;
  title: string;
  desc: string;
  columns: string[];
  task: string;
  badge?: "ai_assisted";
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 id={`${id}-heading`} className="text-xl font-bold text-brand">
          {title}
        </h2>
        {badge && <AILabelBadge kind={badge} />}
      </div>
      <p className="text-sm text-foreground-muted">{desc}</p>

      <div className="overflow-x-auto border border-brand/15 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand/5 text-left text-foreground-muted">
              {columns.map((col) => (
                <th key={col} className="px-3 py-2 font-semibold">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-foreground-muted">
                🚧 구현 예정 — TaskMaster {task} (백엔드 API 대기 중)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
