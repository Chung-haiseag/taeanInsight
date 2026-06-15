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
import {
  classifyTest,
  getRules,
  updateRule,
  type ClassifyTestResult,
  type ManagedRule,
} from "@/lib/api/rules";
import { ZoomPanImage } from "@/components/zoom-pan-image";
import {
  absUrl,
  getEbookArticles,
  getEbookIssues,
  verifyEbookArticle,
  editEbookArticle,
  deleteEbookArticle,
  type EbookArticle,
  type EbookIssue,
} from "@/lib/api/ebook-review";

type AdminTab = "cost" | "review" | "citizen" | "governance" | "ebook";
const ADMIN_TABS: { key: AdminTab; label: string }[] = [
  { key: "cost", label: "💰 비용" },
  { key: "review", label: "🛡 AI 검수" },
  { key: "citizen", label: "🧑‍💻 시민기자" },
  { key: "governance", label: "📏 민감규칙" },
  { key: "ebook", label: "📰 전자북 검수" },
];

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("cost");

  // 상단 헤더 메뉴(해시 앵커) 클릭 ↔ 탭 동기화
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "").replace("-heading", "");
      if (ADMIN_TABS.some((t) => t.key === h)) setTab(h as AdminTab);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const selectTab = (k: AdminTab) => {
    setTab(k);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${k}-heading`);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-brand">관리자 대시보드</h1>
        <p className="text-foreground-muted">
          비용 감시 · AI 콘텐츠 검수 · 시민기자 운영 · 민감주제 규칙 · 전자북 검수. 메뉴별로 전환됩니다.
        </p>
        <div className="bg-accent-subtle/40 border border-accent rounded-lg p-3 text-sm text-foreground-muted">
          🔒 <strong className="text-brand">인증 미적용 (데모)</strong> — 실제 운영 시 SSO + 관리자 권한 검사가
          필요합니다. (TaskMaster #21 / #26)
        </div>
      </header>

      {/* 탭바 — 메뉴별 전환 (헤더 메뉴와 동기화) */}
      <div className="flex flex-wrap gap-1.5 border-b border-brand/15 pb-2">
        {ADMIN_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`rounded-t px-3.5 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-brand text-background" : "text-foreground-muted hover:bg-foreground-muted/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={tab === "cost" ? "" : "hidden"}><CostMonitorSection /></div>
      <div className={tab === "review" ? "" : "hidden"}><ReviewQueueSection /></div>
      <div className={tab === "citizen" ? "" : "hidden"}><CitizenOpsSection /></div>
      <div className={tab === "governance" ? "" : "hidden"}><GovernanceSection /></div>
      <div className={tab === "ebook" ? "" : "hidden"}><EbookReviewSection /></div>
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

// ── 4. 민감주제 규칙 (실데이터) ─────────────────────────────
function GovernanceSection() {
  const [rules, setRules] = useState<ManagedRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setRules((await getRules()).rules);
      } catch (e) {
        setError(e instanceof Error ? e.message : "규칙을 불러오지 못했습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function patchLocal(topic: string, patch: Partial<ManagedRule>) {
    setRules((prev) => prev.map((r) => (r.topic === topic ? { ...r, ...patch } : r)));
  }

  async function toggle(topic: string, field: "enabled" | "requiresHitl" | "blockAiOnly", value: boolean) {
    patchLocal(topic, { [field]: value });
    try {
      await updateRule(topic, { [field]: value });
    } catch {
      /* 데모: 실패해도 로컬 반영 유지 */
    }
  }

  async function saveKeywords(topic: string, keywords: string[]) {
    patchLocal(topic, { keywords });
    try {
      await updateRule(topic, { keywords });
    } catch {
      /* 데모 */
    }
  }

  return (
    <section aria-labelledby="governance-heading" className="space-y-3">
      <h2 id="governance-heading" className="text-xl font-bold text-brand">
        ⚠️ 민감주제 규칙
      </h2>
      <p className="text-sm text-foreground-muted">
        선거·범죄·의료 등 민감주제 차단 규칙을 편집팀이 관리합니다. HITL(사람 검토)·AI 단독 차단·키워드를 조정할 수 있어요.
      </p>

      <ClassifyTestBox />

      {loading && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {error && (
        <p className="text-sm text-red-600 border border-red-200 rounded p-3 bg-red-50">⚠️ {error}</p>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {rules.map((r) => (
            <article
              key={r.topic}
              className={`border rounded-lg p-4 space-y-2 ${r.enabled ? "border-brand/15 bg-background" : "border-brand/10 bg-brand/5 opacity-70"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-brand">
                    {SENSITIVE_TOPIC_LABELS[r.topic] ?? r.topic}
                  </span>
                  <span className="text-xs text-foreground-muted"> · {r.description}</span>
                </div>
                <Switch label="활성" checked={r.enabled} onChange={(v) => toggle(r.topic, "enabled", v)} />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Switch label="HITL 검토" checked={r.requiresHitl} onChange={(v) => toggle(r.topic, "requiresHitl", v)} />
                <Switch
                  label="AI 단독 차단"
                  checked={r.blockAiOnly}
                  onChange={(v) => toggle(r.topic, "blockAiOnly", v)}
                />
              </div>

              <KeywordEditor keywords={r.keywords} onSave={(kw) => saveKeywords(r.topic, kw)} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-1.5 text-xs"
    >
      <span
        className={`inline-block w-8 h-4 rounded-full transition-colors relative ${checked ? "bg-accent" : "bg-brand/20"}`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-background transition-all ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
      <span className={checked ? "text-brand font-semibold" : "text-foreground-muted"}>{label}</span>
    </button>
  );
}

function KeywordEditor({ keywords, onSave }: { keywords: string[]; onSave: (kw: string[]) => void }) {
  const [value, setValue] = useState(keywords.join(", "));
  const [editing, setEditing] = useState(false);
  const dirty = value !== keywords.join(", ");

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {keywords.map((k) => (
          <span key={k} className="inline-flex items-center rounded bg-brand/5 border border-brand/15 px-2 py-0.5 text-xs text-foreground-muted">
            {k}
          </span>
        ))}
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-accent hover:underline">
          키워드 편집
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="키워드 (쉼표로 구분)"
        className="w-full border border-brand/20 rounded px-2 py-1.5 text-sm"
        placeholder="쉼표로 구분 (예: 선거, 후보, 정당)"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const kw = value.split(",").map((s) => s.trim()).filter(Boolean);
            onSave(kw);
            setEditing(false);
          }}
          disabled={!dirty}
          className="bg-brand text-background px-3 py-1 rounded text-xs font-semibold disabled:opacity-50"
        >
          저장
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(keywords.join(", "));
            setEditing(false);
          }}
          className="text-xs text-foreground-muted underline"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function ClassifyTestBox() {
  const [text, setText] = useState("군수 후보가 갭투자 단기 매매를 권유했다");
  const [result, setResult] = useState<ClassifyTestResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      setResult(await classifyTest(text));
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-accent/40 rounded-lg p-3 bg-accent-subtle/20 space-y-2">
      <p className="text-sm font-semibold text-brand">🔎 분류 테스트</p>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="테스트 문장"
          className="flex-1 border border-brand/20 rounded px-2 py-1.5 text-sm"
          placeholder="문장을 입력하면 어떤 민감주제에 걸리는지 보여줍니다"
        />
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="bg-accent text-background px-4 py-1.5 rounded text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "검사 중…" : "검사"}
        </button>
      </div>
      {result && (
        <div className="text-sm space-y-1">
          {result.matches.length === 0 ? (
            <p className="text-foreground-muted">✅ 걸린 민감주제 없음</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {result.matches.map((m) => (
                  <Tag key={m.topic} tone="danger">
                    {SENSITIVE_TOPIC_LABELS[m.topic] ?? m.topic} ({m.matchedKeywords.join(", ")})
                  </Tag>
                ))}
              </div>
              <p className="text-xs text-foreground-muted">
                {result.requiresHitl && "HITL 검토 필요 "}
                {result.blockAiOnly && "· AI 단독 차단"}
              </p>
            </>
          )}
        </div>
      )}
    </div>
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

// ── 5. 전자북(과거지면) 디지털화 검수 ─────────────────────────
// 신문사 관리자가 OCR 결과를 원본 지면과 나란히 대조해 승인/수정필요를 기록.
function EbookReviewSection() {
  const [issues, setIssues] = useState<EbookIssue[]>([]);
  const [date, setDate] = useState<string>("");
  const [status, setStatus] = useState<"all" | "unverified" | "approved" | "flagged">("unverified");
  const [items, setItems] = useState<EbookArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [openPage, setOpenPage] = useState<number | null>(null); // 원본 지면 펼친 idxno
  const [openBody, setOpenBody] = useState<number | null>(null); // 본문 펼친 idxno
  const [editIdx, setEditIdx] = useState<number | null>(null);   // 교정 중인 idxno
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await getEbookIssues();
        setIssues(r.issues);
        const first = r.issues.find((i) => i.unverified > 0) ?? r.issues[0];
        if (first) setDate(first.date);
      } catch (e) {
        setError(e instanceof Error ? e.message : "검수 현황을 불러오지 못했습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!date) return;
    (async () => {
      try {
        const r = await getEbookArticles(date, status, page);
        setItems(r.items);
        setTotal(r.total);
      } catch (e) {
        setError(e instanceof Error ? e.message : "기사 목록을 불러오지 못했습니다");
      }
    })();
  }, [date, status, page]);

  // 현재 필터와 맞는 상태인가 — 안 맞으면 목록에서 제거(예: '미검수' 필터에서 승인되면 사라짐)
  const matchesFilter = (st: "approved" | "flagged" | null) =>
    status === "all" || (status === "unverified" ? st === null : st === status);

  // 상태 변경 후 목록 반영 — 필터에 맞으면 갱신, 안 맞으면 제거(+건수 감소)
  function reflect(idxno: number, patch: Partial<EbookArticle>, newStatus: "approved" | "flagged" | null) {
    if (matchesFilter(newStatus)) {
      setItems((prev) => prev.map((a) => (a.idxno === idxno ? { ...a, ...patch } : a)));
    } else {
      setItems((prev) => prev.filter((a) => a.idxno !== idxno));
      setTotal((t) => Math.max(0, t - 1));
    }
    getEbookIssues().then((r) => setIssues(r.issues)).catch(() => {});
  }

  async function removeArticle(a: EbookArticle) {
    if (!window.confirm(`이 기사를 삭제할까요?\n\n#${a.idxno} ${a.title}\n\n되돌릴 수 없습니다.`)) return;
    try {
      await deleteEbookArticle(a.idxno);
      setItems((prev) => prev.filter((x) => x.idxno !== a.idxno));
      setTotal((t) => Math.max(0, t - 1));
      getEbookIssues().then((r) => setIssues(r.issues)).catch(() => {});
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "삭제 실패");
    }
  }

  async function decide(idxno: number, s: "approved" | "flagged" | null) {
    let note: string | undefined;
    if (s === "flagged") {
      const v = window.prompt("수정필요 사유(선택):") ?? "";
      note = v.trim() || undefined;
    }
    await verifyEbookArticle(idxno, s, note);
    reflect(idxno, { verify_status: s, verify_note: note ?? null }, s);
  }

  function startEdit(a: EbookArticle) {
    setEditIdx(a.idxno);
    setDraftTitle(a.title);
    setDraftBody(a.body ?? "");
    if (openPage !== a.idxno) setOpenPage(a.idxno); // 원본 지면 자동 펼침
  }

  async function saveEdit(idxno: number) {
    if (!draftBody.trim()) { window.alert("본문이 비어 있습니다."); return; }
    setSaving(true);
    try {
      const r = await editEbookArticle(idxno, draftTitle, draftBody);
      setEditIdx(null);
      // 교정 저장 = 승인 처리 → 필터에 안 맞으면(미검수/수정필요) 목록에서 제거
      reflect(
        idxno,
        { title: r.title ?? draftTitle, body: r.body, excerpt: r.excerpt, verify_status: "approved", verify_note: "본문 교정" },
        "approved",
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  const faithBadge = (f: number | null) => {
    if (f == null) return null;
    const cls = f >= 0.9 ? "bg-green-100 text-green-800" : f >= 0.85 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700";
    return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>충실도 {f.toFixed(2)}</span>;
  };
  const statusBadge = (a: EbookArticle) =>
    a.verify_status === "approved" ? (
      <span className="rounded bg-green-600 px-1.5 py-0.5 text-xs font-semibold text-white">✓ 승인됨</span>
    ) : a.verify_status === "flagged" ? (
      <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">⚠ 수정필요</span>
    ) : (
      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-semibold text-gray-600">미검수</span>
    );

  return (
    <section aria-labelledby="ebook-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="ebook-heading" className="text-xl font-bold text-brand">
          📰 전자북(과거지면) 디지털화 검수
        </h2>
        <span className="text-xs text-foreground-muted">OCR 결과를 원본 지면과 대조해 승인/반려</span>
      </div>

      {loading && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* 호(발행일) 선택 */}
      {issues.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {issues.map((i) => (
            <button
              key={i.date}
              onClick={() => { setDate(i.date); setPage(1); }}
              className={`rounded border px-3 py-1.5 text-sm ${date === i.date ? "border-brand bg-brand text-background" : "border-brand/20 hover:border-brand/50"}`}
            >
              {i.date}
              <span className="ml-2 text-xs opacity-80">
                {i.unverified > 0 ? `미검수 ${i.unverified}` : "완료"} / {i.total}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 상태 필터 */}
      {date && (
        <div className="flex gap-1 text-sm">
          {([["unverified", "미검수"], ["flagged", "수정필요"], ["approved", "승인됨"], ["all", "전체"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => { setStatus(k); setPage(1); }}
              className={`rounded px-2.5 py-1 ${status === k ? "bg-brand text-background" : "bg-foreground-muted/10 hover:bg-foreground-muted/20"}`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto self-center text-xs text-foreground-muted">{total}건</span>
        </div>
      )}

      {/* 기사 목록 (충실도 낮은 순 — 의심부터 검수) */}
      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.idxno} className="rounded-lg border border-brand/15 bg-background p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {statusBadge(a)}
              {faithBadge(a.faithfulness)}
              <span className="text-xs text-foreground-muted">{a.section} · #{a.idxno}</span>
              <div className="ml-auto flex gap-1.5">
                <button onClick={() => decide(a.idxno, "approved")} className="rounded bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">✓ 승인</button>
                <button onClick={() => decide(a.idxno, "flagged")} className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700">⚠ 수정필요</button>
                {a.verify_status && (
                  <button onClick={() => decide(a.idxno, null)} className="rounded bg-gray-300 px-2 py-1 text-xs hover:bg-gray-400">↩︎</button>
                )}
                <button onClick={() => removeArticle(a)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50" title="기사 삭제">🗑 삭제</button>
              </div>
            </div>
            <h3 className="font-bold text-brand">{a.title}</h3>
            {a.verify_note && <p className="text-xs text-red-700">메모: {a.verify_note}</p>}
            {typeof a.faithfulness === "number" && a.faithfulness < 0.75 && (
              <p className="rounded-md border-l-4 border-amber-600 bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">
                ⚠ 완벽하게 OCR이 되지 않아, 기사 내용을 확인하려면 원본 지면을 확인하세요. (독자 화면에도 동일 안내 표시됨)
              </p>
            )}
            <p className="text-sm text-foreground-muted line-clamp-2">{a.excerpt}</p>

            <div className="flex flex-wrap gap-2 text-xs">
              <button onClick={() => setOpenBody(openBody === a.idxno ? null : a.idxno)} className="underline text-brand">
                {openBody === a.idxno ? "본문 접기" : "본문 전체 보기"}
              </button>
              {a.page_image && (
                <button onClick={() => setOpenPage(openPage === a.idxno ? null : a.idxno)} className="underline text-brand">
                  {openPage === a.idxno ? "원본 지면 접기" : "원본 지면과 대조"}
                </button>
              )}
              <button onClick={() => (editIdx === a.idxno ? setEditIdx(null) : startEdit(a))} className="underline text-brand font-semibold">
                {editIdx === a.idxno ? "교정 취소" : "✏️ 본문 교정"}
              </button>
              <a href={`/news/${a.idxno}`} target="_blank" rel="noreferrer" className="underline text-foreground-muted">독자 화면에서 보기 ↗</a>
            </div>

            {openBody === a.idxno && (
              <div className="whitespace-pre-wrap rounded bg-foreground-muted/5 p-3 text-sm">{a.body}</div>
            )}

            {/* 대조 뷰: 좌=디지털화 본문 / 우=원본 지면 (지면 공유 구조 — 클립 없음) */}
            {openPage === a.idxno && a.page_image && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground-muted">디지털화 본문 {editIdx === a.idxno && <span className="text-brand">· 교정 중</span>}</p>
                    {editIdx !== a.idxno && (
                      <button onClick={() => startEdit(a)} className="text-xs underline text-brand">✏️ 교정</button>
                    )}
                  </div>
                  {editIdx === a.idxno ? (
                    <div className="space-y-2">
                      <input
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder="제목"
                        className="w-full rounded border border-brand/30 px-2 py-1 text-sm font-semibold"
                      />
                      <textarea
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        rows={16}
                        className="w-full rounded border border-brand/30 p-3 text-sm leading-relaxed font-mono"
                        placeholder="원본 지면을 보고 본문을 교정하세요"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveEdit(a.idxno)}
                          disabled={saving}
                          className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50"
                        >
                          {saving ? "저장 중…" : "💾 저장 (승인 처리)"}
                        </button>
                        <button onClick={() => setEditIdx(null)} className="rounded bg-foreground-muted/15 px-3 py-1.5 text-xs hover:bg-foreground-muted/25">취소</button>
                        <span className="text-xs text-foreground-muted">저장하면 라이브에 즉시 반영되고 ‘승인됨’으로 처리됩니다</span>
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded bg-foreground-muted/5 p-3 text-sm leading-relaxed">{a.body}</div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground-muted">원본 지면 ({a.section})</p>
                    <a
                      href={(absUrl(a.page_image) ?? "").replace(/\.jpg(\?|$)/, "full.jpg$1")}
                      target="_blank" rel="noreferrer"
                      className="text-xs underline text-brand"
                    >🔍 고해상 새 창</a>
                  </div>
                  <ZoomPanImage src={absUrl(a.page_image) ?? ""} fullSrc={(absUrl(a.page_image) ?? "").replace(/\.jpg(\?|$)/, "full.jpg$1")} />
                </div>
              </div>
            )}
          </li>
        ))}
        {date && items.length === 0 && (
          <li className="rounded-lg border border-dashed border-brand/20 p-6 text-center text-sm text-foreground-muted">
            해당 조건의 기사가 없습니다.
          </li>
        )}
      </ul>

      {/* 페이지네이션 */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">이전</button>
          <span>{page} / {Math.ceil(total / 20)}</span>
          <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">다음</button>
        </div>
      )}
    </section>
  );
}

