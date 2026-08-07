"use client";
import { useEffect, useState } from "react";
import { getAffiliationQueue, rejectAffiliation, verifyKg, type AffiliationCandidate } from "@/lib/api/kg";

// 소속(belongs_to) 검수 — 아카이브에서 추출한 (인물·조직·직함) 후보를 신뢰도순으로 훑어
// 승인(verified=1=사실층·AI 근거) 또는 반려(삭제)한다. 지어내기 방지: 승인된 소속만 공개 답변·관계망에 인용.
export default function AffiliationReview() {
  const [rows, setRows] = useState<AffiliationCandidate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [approved, setApproved] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [bulk, setBulk] = useState(false);

  async function load() {
    setErr(null); setRows(null);
    try { setRows((await getAffiliationQueue(300)).candidates); }
    catch { setErr("목록을 불러오지 못했습니다. 로그인/권한을 확인하세요."); setRows([]); }
  }
  useEffect(() => { load(); }, []);

  async function approve(r: AffiliationCandidate) {
    setBusy(r.id);
    try {
      await verifyKg("kg_edges", r.id, true);
      setRows((rs) => rs?.filter((x) => x.id !== r.id) ?? rs);
      setApproved((n) => n + 1);
    } catch { /* 유지 */ } finally { setBusy(null); }
  }
  async function reject(r: AffiliationCandidate) {
    setBusy(r.id);
    try {
      await rejectAffiliation(r.id);
      setRows((rs) => rs?.filter((x) => x.id !== r.id) ?? rs);
      setRejected((n) => n + 1);
    } catch { /* 유지 */ } finally { setBusy(null); }
  }
  async function approveHighConfidence() {
    if (!rows) return;
    setBulk(true);
    const targets = rows.filter((r) => r.confidence >= 0.8);
    for (const r of targets) {
      try { await verifyKg("kg_edges", r.id, true); setApproved((n) => n + 1); setRows((rs) => rs?.filter((x) => x.id !== r.id) ?? rs); }
      catch { /* 계속 */ }
    }
    setBulk(false);
  }

  const confColor = (c: number) => (c >= 0.8 ? "text-emerald-700" : c >= 0.6 ? "text-amber-600" : "text-foreground-muted");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-foreground-muted">
          아카이브 기사에서 규칙 추출한 <span className="font-semibold text-brand">소속(인물→조직)</span> 후보입니다. 근거 문장을 보고
          맞으면 <span className="font-semibold text-brand">승인</span>(=확인된 사실, AI 답변·관계망에 인용), 아니면 <span className="font-semibold text-red-600">반려</span>하세요.
          승인 전까지는 통계(탐색층)로만 쓰이고 답변 근거로는 안 씁니다 — <span className="font-semibold">지어내기 방지</span>.
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={approveHighConfidence} disabled={bulk || !rows?.some((r) => r.confidence >= 0.8)}
            className="rounded border border-emerald-500/40 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
            {bulk ? "일괄 승인 중…" : "고신뢰(≥0.8) 일괄 승인"}
          </button>
          <button type="button" onClick={load} className="rounded border border-brand/30 px-3 py-1.5 text-sm text-brand hover:bg-brand/5">새로고침</button>
        </div>
      </div>
      {(approved > 0 || rejected > 0) && (
        <p className="text-sm"><span className="text-emerald-700">승인 {approved}</span> · <span className="text-red-600">반려 {rejected}</span> (이번 세션)</p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {rows === null && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {rows && rows.length === 0 && !err && <p className="text-sm text-foreground-muted">검수할 소속 후보가 없습니다(모두 처리됨).</p>}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand/15 text-left text-xs text-foreground-muted">
                <th className="py-2 pr-3">인물 → 조직</th>
                <th className="py-2 pr-3">직함</th>
                <th className="py-2 pr-3">언급</th>
                <th className="py-2 pr-3">신뢰도</th>
                <th className="py-2 pr-3">근거(기사 발췌)</th>
                <th className="py-2">검수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-brand/5 align-top">
                  <td className="py-2 pr-3 font-medium">{r.person} <span className="text-foreground-muted">→</span> {r.org}</td>
                  <td className="py-2 pr-3"><span className="rounded bg-brand/8 px-1.5 py-0.5 text-xs text-brand">{r.role || "—"}</span></td>
                  <td className="py-2 pr-3 tabular-nums text-foreground-muted">{r.count}회</td>
                  <td className={`py-2 pr-3 font-semibold tabular-nums ${confColor(r.confidence)}`}>{r.confidence.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-xs text-foreground-muted">
                    {(r.evidence[0] || "—")}
                    {r.years.length > 0 && <span className="ml-1 text-[0.65rem] text-foreground-muted/70">({r.years[0]}~{r.years[r.years.length - 1]})</span>}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1.5">
                      <button type="button" disabled={busy === r.id || bulk} onClick={() => approve(r)}
                        className="rounded bg-brand px-2 py-1 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50">✓ 승인</button>
                      <button type="button" disabled={busy === r.id || bulk} onClick={() => reject(r)}
                        className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
