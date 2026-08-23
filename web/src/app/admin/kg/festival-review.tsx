"use client";
import { useEffect, useState } from "react";
import { getFestivalQueue, rejectEvent, verifyKg, bulkFestivalTriage,
  type FestivalCandidate, type FestTriage, type FestTriageCounts, type FestBulkResult } from "@/lib/api/kg";

// 축제 검수 — 아카이브에서 규칙 추출한 축제 후보(event, verified=0)를 언급수순으로 훑어
// 승인(verified=1=사실층·지식그래프 정식 사건)/반려(삭제)한다. 노이즈(타지역·중복)는 반려.
export default function FestivalReview() {
  const [rows, setRows] = useState<FestivalCandidate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [approved, setApproved] = useState(0);
  const [rejected, setRejected] = useState(0);

  // 갈래 — 이름·근거의 지명이 답을 말해주는 것과 사람이 볼 것을 가른다.
  const [want, setWant] = useState<FestTriage | "전체">("확인필요");
  const [counts, setCounts] = useState<FestTriageCounts | null>(null);
  const [bulk, setBulk] = useState(false);
  const [bres, setBres] = useState<FestBulkResult | null>(null);

  async function load(w: FestTriage | "전체" = want) {
    setErr(null); setRows(null); setBres(null);
    try {
      const r = await getFestivalQueue(300, w);
      setRows(r.candidates); setCounts(r.counts ?? null);
    } catch { setErr("목록을 불러오지 못했습니다. 로그인/권한을 확인하세요."); setRows([]); }
  }
  useEffect(() => { load("확인필요"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function runBulk(w: FestTriage, action: "approve" | "reject") {
    const dry = await bulkFestivalTriage(w, action).catch(() => null);
    if (!dry || dry.refused || !dry.matched) { setBres(dry ?? null); return; }
    const what = action === "approve" ? "검증 완료(사실층)로 승인" : "삭제(반려)";
    const warn = action === "reject" ? "\n\n⚠ 반려는 삭제라 되돌릴 수 없습니다." : "\n\n승인된 축제는 AI 답변에 근거로 쓰입니다.";
    if (!window.confirm(`'${w}' ${dry.matched}건을 ${what}합니다.${warn}\n\n${(dry.names ?? []).slice(0, 12).join(", ")}${(dry.names?.length ?? 0) > 12 ? " …" : ""}\n\n진행할까요?`)) return;
    setBulk(true);
    try {
      const r = await bulkFestivalTriage(w, action, true);
      setBres(r);
      if (action === "approve") setApproved((n) => n + r.changed); else setRejected((n) => n + r.changed);
      await load();
    } catch { /* 유지 */ } finally { setBulk(false); }
  }

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
      {/* 갈래 — 이름·근거 제목의 지명이 답을 말해준다.
          실측(2026-08-23, 대기 166건): 태안 50% · 타지역 3% · 이름아님 5% · 확인필요 40%. */}
      <div className="rounded-lg border border-brand/15 bg-accent-subtle/15 p-3">
        <p className="mb-2 text-sm">
          이름과 근거 제목의 <strong>지명으로 미리 갈라뒀습니다.</strong> &lsquo;몽산포항 주꾸미축제&rsquo;는 태안,
          &lsquo;보령머드축제&rsquo;는 타 지역입니다. 갈래째 처리하시고 마지막 갈래만 하나씩 보시면 됩니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {(["확인필요", "태안", "타지역", "이름아님", "전체"] as const).map((w) => (
            <button key={w} type="button" onClick={() => { setWant(w); void load(w); }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                want === w ? "bg-brand text-background" : "border border-brand/25 text-brand hover:bg-brand/5"}`}>
              {w === "확인필요" ? "🔍 사람이 볼 것" : w === "태안" ? "📍 태안" : w === "타지역" ? "🚫 타 지역" : w === "이름아님" ? "✂️ 이름 아님" : "전체"}
              {counts && w !== "전체" && <span className="ml-1 tabular-nums">{counts[w]}</span>}
            </button>
          ))}
          {want === "태안" && (
            <button type="button" onClick={() => void runBulk("태안", "approve")} disabled={bulk}
              className="rounded border border-emerald-500/40 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              {bulk ? "처리 중…" : `이 갈래 ${counts?.태안 ?? 0}건 일괄 승인`}
            </button>
          )}
          {(want === "타지역" || want === "이름아님") && (
            <button type="button" onClick={() => void runBulk(want, "reject")} disabled={bulk}
              className="rounded border border-red-400/50 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">
              {bulk ? "처리 중…" : `이 갈래 ${counts?.[want] ?? 0}건 일괄 반려(삭제)`}
            </button>
          )}
        </div>
        {bres?.refused && <p className="mt-2 text-sm text-amber-700">{bres.refused}</p>}
        {bres?.applied && (
          <p className="mt-2 text-sm font-semibold text-brand">{bres.changed}건 {bres.action === "approve" ? "승인" : "반려"}했습니다.</p>
        )}
        {want === "확인필요" && (
          <p className="mt-2 text-xs text-foreground-muted">
            이 갈래는 이름에도 근거에도 지명이 없습니다 — &lsquo;튤립꽃축제&rsquo;처럼 태안 것일 가능성이 높은 것과
            &lsquo;강경젓갈축제&rsquo;처럼 타 지역인 것이 섞여 있어 갈래째 처리할 수 없습니다.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-foreground-muted">
          아카이브에서 규칙 추출한 <span className="font-semibold text-brand">축제 후보</span>입니다(언급 3회 이상). 태안 축제가 맞으면
          <span className="font-semibold text-brand"> 승인</span>(=지식그래프 정식 사건), 타지역·중복·오탐이면 <span className="font-semibold text-red-600">반려</span>하세요.
          승인 전까지는 통계로만 쓰입니다.
        </p>
        <button type="button" onClick={() => void load()} className="shrink-0 rounded border border-brand/30 px-3 py-1.5 text-sm text-brand hover:bg-brand/5">새로고침</button>
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
