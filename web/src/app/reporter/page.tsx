"use client";

// 기자 취재 알림 — 등록·키워드 감시·알림 인박스. Web Push로 취재거리 즉시 수신.

import { useEffect, useState } from "react";

import {
  getReporterMe, registerReporter, unregisterReporter,
  addReporterKeyword, deleteReporterKeyword, getReporterAlerts,
  type ReporterKeyword, type ReporterAlert,
} from "@/lib/api/reporter";
import { PushOptInButton } from "@/components/me/push_opt_in";

export default function ReporterPage() {
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [keywords, setKeywords] = useState<ReporterKeyword[]>([]);
  const [alerts, setAlerts] = useState<ReporterAlert[]>([]);
  const [kw, setKw] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const me = await getReporterMe().catch(() => null);
    if (me) { setRegistered(me.registered); setKeywords(me.keywords); }
    const a = await getReporterAlerts().catch(() => null);
    if (a) setAlerts(a.alerts);
  }
  useEffect(() => { void refresh(); }, []);

  async function enable() { setBusy(true); try { await registerReporter(); await refresh(); } finally { setBusy(false); } }
  async function disable() { setBusy(true); try { await unregisterReporter(); await refresh(); } finally { setBusy(false); } }
  async function addKw() {
    const v = kw.trim(); if (v.length < 2) return;
    setBusy(true);
    try { const r = await addReporterKeyword(v); if (r.ok) { setKw(""); await refresh(); } else alert(r.error === "limit" ? "키워드는 최대 20개" : "추가 실패"); }
    finally { setBusy(false); }
  }
  async function delKw(id: number) { setBusy(true); try { await deleteReporterKeyword(id); await refresh(); } finally { setBusy(false); } }

  const KIND_LABEL: Record<string, string> = { gov: "군청", env: "특보", spike: "급변", keyword: "키워드" };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="pt-2">
        <p className="eyebrow"><span className="inline-block h-px w-6 bg-accent" aria-hidden /> 기자 전용</p>
        <h1 className="mt-4 font-display text-display-sm text-brand">취재 알림</h1>
        <p className="mt-2 text-foreground-muted">군청 새 공지·기상 특보·데이터 급변·키워드를 감지해 <strong className="text-brand">즉시 푸시</strong>로 알려드립니다.</p>
        <span className="accent-rule mt-5" aria-hidden />
      </header>

      {registered === false && (
        <section className="rounded-2xl border border-accent/30 bg-accent-subtle/20 p-5">
          <p className="font-semibold text-brand">📡 취재 알림 받기</p>
          <p className="mt-1 text-sm text-foreground-muted">등록하면 취재거리가 생길 때 알림을 보내드립니다. 브라우저 알림도 함께 허용해 주세요.</p>
          <button type="button" onClick={enable} disabled={busy} className="btn-accent mt-3 px-4 py-2 text-sm disabled:opacity-60">취재 알림 등록</button>
        </section>
      )}

      {registered && (
        <>
          <section className="rounded-2xl border border-brand/10 bg-background p-5 shadow-card sm:p-6 space-y-3">
            <p className="font-semibold text-brand">🔔 알림 수신</p>
            <PushOptInButton vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
            <button type="button" onClick={disable} disabled={busy} className="text-xs text-foreground-muted underline hover:text-brand">취재 알림 해제</button>
          </section>

          <section className="rounded-2xl border border-brand/10 bg-background p-5 shadow-card sm:p-6">
            <p className="font-semibold text-brand">🔎 키워드 감시</p>
            <p className="mt-1 text-xs text-foreground-muted">등록한 키워드가 새 기사·군청 공지 제목에 나오면 알립니다(최대 20개).</p>
            <div className="mt-3 flex gap-2">
              <input value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addKw()}
                placeholder="예: 화력발전, 해상풍력, 적조" className="flex-1 rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm" />
              <button type="button" onClick={addKw} disabled={busy || kw.trim().length < 2} className="btn-accent px-4 py-2 text-sm disabled:opacity-60">추가</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {keywords.map((k) => (
                <span key={k.id} className="flex items-center gap-1 rounded-full bg-brand/5 border border-brand/10 px-3 py-1 text-sm text-brand">
                  {k.keyword}
                  <button type="button" onClick={() => delKw(k.id)} className="text-foreground-muted hover:text-red-600" aria-label="삭제">✕</button>
                </span>
              ))}
              {!keywords.length && <span className="text-sm text-foreground-muted">등록된 키워드가 없습니다.</span>}
            </div>
          </section>
        </>
      )}

      <section className="rounded-2xl border border-brand/10 bg-background p-5 shadow-card sm:p-6">
        <p className="font-semibold text-brand">📨 최근 취재 알림</p>
        {alerts.length === 0 ? (
          <p className="mt-2 text-sm text-foreground-muted">아직 알림이 없습니다. 트리거가 발생하면 여기에 쌓입니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand/10">
            {alerts.map((a, i) => (
              <li key={i} className="py-2.5">
                <a href={a.url || "#"} className="group block">
                  <div className="flex items-center gap-2 text-[11px] text-foreground-muted">
                    <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">{KIND_LABEL[a.kind] ?? a.kind}</span>
                    <span>{(a.created_at ?? "").slice(0, 16).replace("T", " ")}</span>
                  </div>
                  <p className="mt-0.5 font-semibold text-brand group-hover:underline">{a.title}</p>
                  {a.body && <p className="mt-0.5 text-sm text-foreground-muted">{a.body}</p>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
