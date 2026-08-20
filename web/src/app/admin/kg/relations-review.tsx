"use client";
import { useEffect, useState } from "react";
import { getPendingRelations, setRelation, RELTYPES, type PendingRelation, type RelTriage, type TriageCounts } from "@/lib/api/kg";

// 관계 일괄 검토 — 라벨된 관계를 weight순으로 훑어 라벨 수정 + 검증(verified=1)한다.
// 검증하면 목록에서 사라지고(대기=미검증만) 공개 답변(B3)에 반영된다.
export default function RelationsReview() {
  const [rows, setRows] = useState<PendingRelation[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  // 자동 선별 갈래 — 기본은 '검토 필요'만 본다.
  const [tab, setTab] = useState<RelTriage>("review");
  const [counts, setCounts] = useState<TriageCounts | null>(null);

  async function load(which: RelTriage = tab) {
    setErr(null); setRows(null);
    try {
      const r = await getPendingRelations(200, which);
      setRows(r.relations); setCounts(r.counts ?? null);
    }
    catch { setErr("목록을 불러오지 못했습니다. 로그인/권한을 확인하세요."); setRows([]); }
  }
  useEffect(() => { void load(tab); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

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
        <button type="button" onClick={() => void load()} className="shrink-0 rounded border border-brand/30 px-3 py-1.5 text-sm text-brand hover:bg-brand/5">새로고침</button>
      </div>

      {/* 자동 선별 — 분류기가 모른다고 한 것과 라벨이 근거와 어긋난 것을 갈라내, 사람이 볼 양을 줄인다. */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          ["review", "검토 필요", counts?.review],
          ["mismatch", "재분류 필요", counts?.mismatch],
          ["unsure", "근거 불확실", counts?.unsure],
          ["all", "전체", undefined],
        ] as Array<[RelTriage, string, number | undefined]>).map(([k, label, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === k ? "bg-brand text-background" : "border border-brand/25 text-brand hover:bg-brand/5"
            }`}>
            {label}{typeof n === "number" ? ` ${n}` : ""}
          </button>
        ))}
      </div>
      {tab === "unsure" && (
        <p className="rounded-lg bg-amber-50/60 p-3 text-sm text-amber-900">
          분류기가 <strong>스스로 관계를 특정하기 어렵다</strong>고 적은 것들입니다. 근거가 없으니 승인해도 값어치가 없습니다 —
          기사 본문을 더 넣어 다시 분류하는 편이 낫습니다.
        </p>
      )}
      {tab === "mismatch" && (
        <p className="rounded-lg bg-amber-50/60 p-3 text-sm text-amber-900">
          <strong>라벨과 근거가 어긋난</strong> 것들입니다. 예: 근거는 &ldquo;경쟁하며 대립&rdquo;인데 라벨이 &lsquo;소속·상하&rsquo;.
          드롭다운으로 고친 뒤 검증하세요.
        </p>
      )}
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
