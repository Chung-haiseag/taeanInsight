"use client";

// 승격된 소속 재검사 — 고친 추출 규칙(2026-08-18)으로 근거 문장을 다시 돌려, 같은 결론이
//   재현되지 않는 건만 추려 보여준다. 옛 로직의 오귀속이 사실층에 남아 AI 답변에 인용되는 것을 막는다.
//   ※근거는 80자 발췌라 문맥이 잘려 정상 건도 재현 실패할 수 있다 → '틀림'이 아니라 '읽어볼 것'.
//     최종 판단은 사람이 근거를 보고 한다. 강등은 삭제가 아니라 검수 큐로 되돌리는 것이라 안전하다.

import { useState } from "react";
import { auditVerifiedAffiliations, verifyKg, type AuditRow } from "@/lib/api/kg";

export function AffiliationAudit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoted, setDemoted] = useState(0);

  async function run() {
    setLoading(true);
    try { const r = await auditVerifiedAffiliations(500); setRows(r.suspects); setTotal(r.total); }
    catch { setRows(null); }
    setLoading(false);
  }

  async function demote(id: string) {
    setBusy(id);
    try { await verifyKg("kg_edges", id, false); setRows((rs) => rs?.filter((x) => x.id !== id) ?? rs); setDemoted((n) => n + 1); }
    catch { /* 무시 */ }
    setBusy(null);
  }

  async function demoteAll() {
    if (!rows?.length) return;
    if (!window.confirm(`${rows.length}건을 검수 큐로 되돌립니다(삭제 아님).\n되돌린 건은 AI 답변 근거에서 즉시 빠집니다. 진행할까요?`)) return;
    setLoading(true);
    for (const r of rows) {
      try { await verifyKg("kg_edges", r.id, false); setDemoted((n) => n + 1); } catch { /* 계속 */ }
    }
    setRows([]);
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-muted">
        이미 <strong className="text-brand">승격된 소속</strong>을 고친 추출 규칙으로 다시 검사합니다.
        근거 문장에서 같은 결론이 재현되지 않으면 옛 로직의 오귀속일 수 있습니다 — 근거를 보고
        <strong className="text-brand"> 강등</strong>(검수 큐로 되돌림, 삭제 아님)하세요.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={run} disabled={loading}
          className="rounded border border-brand/25 px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5 disabled:opacity-50">
          {loading ? "검사 중…" : "승격분 재검사"}
        </button>
        {rows && (
          <>
            <span className="text-sm text-foreground-muted">승격 {total.toLocaleString()}건 중 <strong className="text-amber-700">{rows.length.toLocaleString()}건</strong> 재검토 필요</span>
            {rows.length > 0 && (
              <button type="button" onClick={demoteAll} disabled={loading}
                className="rounded border border-amber-500/40 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                {rows.length}건 모두 강등
              </button>
            )}
          </>
        )}
        {demoted > 0 && <span className="text-sm text-emerald-700">강등 {demoted}건</span>}
      </div>

      {rows && rows.length === 0 && (
        <p className="rounded border border-emerald-500/30 bg-emerald-50 p-3 text-sm text-emerald-800">
          재검토가 필요한 건이 없습니다 — 승격된 소속이 모두 새 규칙에서도 재현됩니다.
        </p>
      )}

      {rows && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-foreground-muted">
            <tr><th className="py-1">옛 기록</th><th>직함</th><th>새 규칙이 뽑는 것</th><th>근거(저장된 발췌)</th><th className="text-right">조치</th></tr>
          </thead>
          <tbody className="divide-y divide-brand/10">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="py-2 font-medium text-brand">{r.person} → {r.org}</td>
                <td className="py-2">{r.role}</td>
                <td className="py-2 text-xs">
                  {r.nowExtracts.length
                    ? r.nowExtracts.map((s) => <div key={s} className="text-emerald-700">{s}</div>)
                    : <span className="text-foreground-muted">— (아무것도 안 나옴)</span>}
                </td>
                <td className="py-2 text-xs text-foreground-muted">{r.evidence.join(" / ") || "(근거 없음)"}</td>
                <td className="py-2 text-right">
                  <button type="button" disabled={busy === r.id || loading} onClick={() => demote(r.id)}
                    className="rounded border border-amber-500/40 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50">
                    강등
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
