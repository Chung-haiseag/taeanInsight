"use client";
import { useEffect, useState } from "react";
import { getCoverage, assignCoverage, type EntityCoverage } from "@/lib/api/kg";

// 취재 레이더 — 온톨로지 개체(조직·사건·정책)별 최근 보도 커버리지. 오래 무보도(공백)면 취재 후보로 표시.
// 지식그래프를 편집 레이더로: 정체 심한 순으로 "후속취재 필요?"를 한눈에.
const TYPE_LABEL: Record<string, string> = { org: "조직", event: "사건", policy: "정책" };

export default function CoverageRadar() {
  const [rows, setRows] = useState<EntityCoverage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "stale">("all");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<Record<string, string>>({});

  async function assign(r: EntityCoverage) {
    setAssigning(r.id);
    try {
      const res = await assignCoverage(r.id);
      setAssigned((m) => ({ ...m, [r.id]: res.skipped === "already_assigned_today" ? "오늘 배정됨" : res.skipped === "no_reporters" || res.skipped === "no_vapid" ? "기자 미등록" : res.sent > 0 ? `푸시 ${res.sent}건` : "적재됨" }));
    } catch { setAssigned((m) => ({ ...m, [r.id]: "실패" })); } finally { setAssigning(null); }
  }

  async function load() {
    setErr(null); setRows(null);
    try { setRows((await getCoverage()).entities); }
    catch { setErr("불러오지 못했습니다(첫 계산은 몇 초 걸릴 수 있어요). 로그인/권한 확인 후 새로고침."); setRows([]); }
  }
  useEffect(() => { load(); }, []);

  const gapText = (d: number | null) => (d === null ? "무보도" : d < 30 ? `${d}일` : d < 365 ? `${Math.round(d / 30)}개월` : `${(d / 365).toFixed(1)}년`);
  const shown = (rows ?? []).filter((r) => filter === "all" || r.stale);
  const staleCount = (rows ?? []).filter((r) => r.stale).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-foreground-muted">
          지식그래프 개체(조직·사건·정책)가 <span className="font-semibold text-brand">최근 얼마나 보도됐는지</span>를 봅니다. 오래 다루지 않은 개체(<span className="font-semibold text-amber-600">6개월+ 공백</span>)는
          <span className="font-semibold text-brand"> 후속취재 후보</span>입니다. 정체 심한 순 정렬.
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setFilter(filter === "all" ? "stale" : "all")}
            className={`rounded border px-3 py-1.5 text-sm ${filter === "stale" ? "border-amber-500/50 bg-amber-50 text-amber-700" : "border-brand/30 text-brand hover:bg-brand/5"}`}>
            {filter === "stale" ? `공백만 (${staleCount})` : "전체"}
          </button>
          <button type="button" onClick={load} className="rounded border border-brand/30 px-3 py-1.5 text-sm text-brand hover:bg-brand/5">새로고침</button>
        </div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {rows === null && <p className="text-sm text-foreground-muted">계산 중… (개체별 아카이브 집계)</p>}
      {rows && rows.length > 0 && (
        <p className="text-sm text-foreground-muted">총 {rows.length}개 개체 · <span className="text-amber-700">공백(6개월+) {staleCount}개</span></p>
      )}

      {shown.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand/15 text-left text-xs text-foreground-muted">
                <th className="py-2 pr-3">개체</th>
                <th className="py-2 pr-3">종류</th>
                <th className="py-2 pr-3">최근 보도</th>
                <th className="py-2 pr-3">공백</th>
                <th className="py-2 pr-3">최근 1년</th>
                <th className="py-2 pr-3">누적</th>
                <th className="py-2">취재</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`border-b border-brand/5 ${r.stale ? "bg-amber-50/40" : ""}`}>
                  <td className="py-2 pr-3 font-medium">{r.stale && <span className="mr-1" title="6개월+ 공백">📡</span>}{r.name}</td>
                  <td className="py-2 pr-3 text-xs text-foreground-muted">{TYPE_LABEL[r.type] ?? r.type}{r.cat ? `·${r.cat}` : ""}</td>
                  <td className="py-2 pr-3 text-xs text-foreground-muted">{r.lastMention ? String(r.lastMention).slice(0, 10) : "—"}</td>
                  <td className={`py-2 pr-3 font-semibold tabular-nums ${r.stale ? "text-amber-700" : "text-foreground-muted"}`}>{gapText(r.gapDays)}</td>
                  <td className="py-2 pr-3 tabular-nums text-foreground-muted">{r.recent}건</td>
                  <td className="py-2 pr-3 tabular-nums text-foreground-muted">{r.total}건</td>
                  <td className="py-2">
                    {assigned[r.id] ? (
                      <span className="text-xs text-emerald-700">✓ {assigned[r.id]}</span>
                    ) : (
                      <button type="button" disabled={assigning === r.id} onClick={() => assign(r)}
                        className="rounded border border-brand/30 px-2 py-1 text-xs font-semibold text-brand hover:bg-brand/5 disabled:opacity-50">
                        {assigning === r.id ? "…" : "기자 배정"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && shown.length === 0 && !err && <p className="text-sm text-foreground-muted">표시할 개체가 없습니다.</p>}
    </div>
  );
}
