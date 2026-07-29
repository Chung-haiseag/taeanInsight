"use client";
import { useEffect, useState } from "react";
import { getPendingRelations, setRelation, RELTYPES, type PendingRelation } from "@/lib/api/kg";

// 관계 일괄 검토 — 라벨된 관계를 weight순으로 훑어 라벨 수정 + 검증(verified=1)한다.
// 검증하면 목록에서 사라지고(대기=미검증만) 공개 답변(B3)에 반영된다.
export default function RelationsReview() {
  const [rows, setRows] = useState<PendingRelation[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  async function load() {
    setErr(null); setRows(null);
    try { setRows((await getPendingRelations(200)).relations); }
    catch { setErr("목록을 불러오지 못했습니다. 로그인/권한을 확인하세요."); setRows([]); }
  }
  useEffect(() => { load(); }, []);

  async function relabel(r: PendingRelation, reltype: string) {
    setRows((rs) => rs?.map((x) => (x.edgeId === r.edgeId ? { ...x, reltype } : x)) ?? rs);
    try { await setRelation(r.edgeId, { reltype }); }
    catch { setRows((rs) => rs?.map((x) => (x.edgeId === r.edgeId ? { ...x, reltype: r.reltype } : x)) ?? rs); }
  }
  async function verify(r: PendingRelation) {
    setBusy(r.edgeId);
    try {
      await setRelation(r.edgeId, { reltype: r.reltype, verified: true });
      setRows((rs) => rs?.filter((x) => x.edgeId !== r.edgeId) ?? rs); // 검증되면 대기목록에서 제거
      setDone((n) => n + 1);
    } catch { /* 유지 */ } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-foreground-muted">
          라벨된 관계를 동반등장 많은 순으로 검토합니다. <span className="font-semibold text-brand">라벨이 틀리면 드롭다운으로 고치고</span>, 맞으면 <span className="font-semibold text-brand">검증</span>을 누르세요 — 검증한 관계만 공개 답변에 반영됩니다.
        </p>
        <button type="button" onClick={load} className="shrink-0 rounded border border-brand/30 px-3 py-1.5 text-sm text-brand hover:bg-brand/5">새로고침</button>
      </div>
      {done > 0 && <p className="text-sm text-emerald-700">이번 세션에 {done}건 검증 완료.</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {rows === null && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {rows && rows.length === 0 && !err && <p className="text-sm text-foreground-muted">검토할 관계가 없습니다(모두 검증됐거나 라벨 대기 중).</p>}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand/15 text-left text-xs text-foreground-muted">
                <th className="py-2 pr-3">관계(두 인물)</th>
                <th className="py-2 pr-3">동반</th>
                <th className="py-2 pr-3">관계 종류</th>
                <th className="py-2 pr-3">분류 근거</th>
                <th className="py-2">검증</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.edgeId} className="border-b border-brand/5 align-top">
                  <td className="py-2 pr-3 font-medium">{r.a} <span className="text-foreground-muted">↔</span> {r.b}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{r.weight}회</td>
                  <td className="py-2 pr-3">
                    <select value={r.reltype} onChange={(e) => relabel(r, e.target.value)}
                      className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
                      {RELTYPES.map((rt) => <option key={rt} value={rt}>{rt}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3 text-xs text-foreground-muted">{r.reason ?? "—"}</td>
                  <td className="py-2">
                    <button type="button" disabled={busy === r.edgeId} onClick={() => verify(r)}
                      className="rounded bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50">
                      {busy === r.edgeId ? "…" : "✓ 검증"}
                    </button>
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
