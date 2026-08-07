"use client";
import { useEffect, useState } from "react";
import { getFestivalQueue, rejectEvent, verifyKg, type FestivalCandidate } from "@/lib/api/kg";

// 축제 검수 — 아카이브에서 규칙 추출한 축제 후보(event, verified=0)를 언급수순으로 훑어
// 승인(verified=1=사실층·지식그래프 정식 사건)/반려(삭제)한다. 노이즈(타지역·중복)는 반려.
export default function FestivalReview() {
  const [rows, setRows] = useState<FestivalCandidate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [approved, setApproved] = useState(0);
  const [rejected, setRejected] = useState(0);

  async function load() {
    setErr(null); setRows(null);
    try { setRows((await getFestivalQueue(300)).candidates); }
    catch { setErr("목록을 불러오지 못했습니다. 로그인/권한을 확인하세요."); setRows([]); }
  }
  useEffect(() => { load(); }, []);

  async function approve(r: FestivalCandidate) {
    setBusy(r.id);
    try { await verifyKg("kg_nodes", r.id, true); setRows((rs) => rs?.filter((x) => x.id !== r.id) ?? rs); setApproved((n) => n + 1); }
    catch { /* 유지 */ } finally { setBusy(null); }
  }
  async function reject(r: FestivalCandidate) {
    setBusy(r.id);
    try { await rejectEvent(r.id); setRows((rs) => rs?.filter((x) => x.id !== r.id) ?? rs); setRejected((n) => n + 1); }
    catch { /* 유지 */ } finally { setBusy(null); }
  }

  const yspan = (ys: string[]) => (ys.length === 0 ? "—" : ys.length === 1 ? ys[0] : `${ys[0]}~${ys[ys.length - 1]}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-foreground-muted">
          아카이브에서 규칙 추출한 <span className="font-semibold text-brand">축제 후보</span>입니다(언급 3회 이상). 태안 축제가 맞으면
          <span className="font-semibold text-brand"> 승인</span>(=지식그래프 정식 사건), 타지역·중복·오탐이면 <span className="font-semibold text-red-600">반려</span>하세요.
          승인 전까지는 통계로만 쓰입니다.
        </p>
        <button type="button" onClick={load} className="shrink-0 rounded border border-brand/30 px-3 py-1.5 text-sm text-brand hover:bg-brand/5">새로고침</button>
      </div>
      {(approved > 0 || rejected > 0) && (
        <p className="text-sm"><span className="text-emerald-700">승인 {approved}</span> · <span className="text-red-600">반려 {rejected}</span> (이번 세션)</p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {rows === null && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {rows && rows.length === 0 && !err && <p className="text-sm text-foreground-muted">검수할 축제 후보가 없습니다(모두 처리됨).</p>}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand/15 text-left text-xs text-foreground-muted">
                <th className="py-2 pr-3">축제명</th>
                <th className="py-2 pr-3">언급</th>
                <th className="py-2 pr-3">연도</th>
                <th className="py-2 pr-3">근거(기사 제목)</th>
                <th className="py-2">검수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-brand/5 align-top">
                  <td className="py-2 pr-3 font-medium">🎪 {r.name}</td>
                  <td className="py-2 pr-3 tabular-nums text-foreground-muted">{r.count}회</td>
                  <td className="py-2 pr-3 text-xs text-foreground-muted">{yspan(r.years)}</td>
                  <td className="py-2 pr-3 text-xs text-foreground-muted">{r.evidence[0] || "—"}</td>
                  <td className="py-2">
                    <div className="flex gap-1.5">
                      <button type="button" disabled={busy === r.id} onClick={() => approve(r)}
                        className="rounded bg-brand px-2 py-1 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50">✓ 승인</button>
                      <button type="button" disabled={busy === r.id} onClick={() => reject(r)}
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
