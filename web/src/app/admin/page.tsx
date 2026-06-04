"use client";

// 관리자(운영자) 대시보드 — 골격(skeleton)
// 비용 모니터링은 실데이터 연동, 나머지 섹션은 백엔드 구현 대기 자리표시.
// 연관 TaskMaster: #19(비용·완료), #26(HITL 검수), #29(시민기자 정산), AI 거버넌스(#27)

import { useEffect, useState } from "react";

import { AILabelBadge } from "@/components/ai-label-badge";
import { getCostSummary, type MonthlyCostReport } from "@/lib/api/admin";

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
          비용 감시 · AI 콘텐츠 검수 · 시민기자 운영을 한곳에서. 현재는 골격(skeleton)이며, 비용 현황만 실데이터와
          연동됩니다.
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

// ── 2. AI 콘텐츠 검수 큐 (HITL, 자리표시) ────────────────────
function ReviewQueueSection() {
  return (
    <PlaceholderSection
      id="review"
      title="🛡️ AI 콘텐츠 검수 큐 (HITL)"
      badge="ai_assisted"
      task="#26 / #27"
      desc="AI가 생성·보조한 콘텐츠 중 사람 검수가 필요한 항목을 승인/반려합니다. PII·민감주제 탐지 결과가 함께 표시됩니다."
      columns={["콘텐츠", "유형", "AI 라벨", "민감도", "검수 상태"]}
    />
  );
}

// ── 3. 시민기자 운영 (자리표시) ─────────────────────────────
function CitizenOpsSection() {
  return (
    <PlaceholderSection
      id="citizen"
      title="📰 시민기자 운영"
      task="#28 / #29 / #43"
      desc="시민기자 신청 승인, 교육 진도, 기사 발행 현황, 월별 정산을 관리합니다. (모집 일정: 2026년 7월 중순)"
      columns={["기자", "발행 수", "교육 진도", "이번 달 정산", "상태"]}
    />
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
