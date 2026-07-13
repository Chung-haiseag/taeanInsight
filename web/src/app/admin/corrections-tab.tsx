"use client";

// 관리자 — 회원 수정 요청 처리 탭.
// 대기 요청 목록(원문→제안 대비) → 펼쳐서 본문 편집("제안대로 치환" 보조) → 저장 후 승인/반려.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  getAdminCorrections,
  resolveCorrection,
  CORRECTION_STATUS_LABELS,
  type AdminCorrection,
  type CorrectionStatus,
} from "@/lib/api/corrections";
import { editEbookArticle } from "@/lib/api/ebook-review";

const STATUS_TABS: { key: CorrectionStatus | "all"; label: string }[] = [
  { key: "pending", label: "대기" },
  { key: "accepted", label: "반영됨" },
  { key: "rejected", label: "반려" },
  { key: "all", label: "전체" },
];

export function CorrectionsSection() {
  const [status, setStatus] = useState<CorrectionStatus | "all">("pending");
  const [items, setItems] = useState<AdminCorrection[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getAdminCorrections(status);
      setItems(r.items);
      setCounts(r.counts);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오기 실패");
    }
  }, [status]);

  useEffect(() => { setItems(null); load(); }, [load]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-brand">✏️ 회원 수정 요청</h2>
        <span className="text-sm text-foreground-muted">
          대기 {counts.pending ?? 0} · 반영 {counts.accepted ?? 0} · 반려 {counts.rejected ?? 0}
        </span>
      </div>

      <div className="flex gap-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatus(t.key)}
            aria-pressed={status === t.key}
            className={`rounded-full px-3 py-1 text-sm ${status === t.key ? "bg-brand text-background font-semibold" : "text-foreground-muted hover:bg-brand/5"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err && <p className="text-sm text-red-600">⚠️ {err}</p>}
      {items === null && !err && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {items?.length === 0 && <p className="text-sm text-foreground-muted">해당 상태의 요청이 없습니다.</p>}

      <ul className="space-y-3">
        {items?.map((it) => (
          <CorrectionItem key={it.id} item={it} onResolved={load} />
        ))}
      </ul>
    </section>
  );
}

function CorrectionItem({ item, onResolved }: { item: AdminCorrection; onResolved: () => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(item.body ?? "");
  const [adminNote, setAdminNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 제안대로 치환 — 지목 원문이 본문에 정확히 1회 나올 때만(오치환 방지)
  const occurrences = item.selectedText ? body.split(item.selectedText).length - 1 : 0;
  const applySuggestion = () => {
    if (occurrences !== 1) return;
    setBody(body.replace(item.selectedText, item.suggestion));
    setMsg("치환됨 — 아래 '본문 저장'으로 반영하세요");
  };

  const saveBody = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await editEbookArticle(item.idxno, item.title ?? "", body);
      setMsg("본문 저장 완료(검수 승인 처리됨)");
    } catch (e) {
      setMsg(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (action: "accept" | "reject") => {
    setBusy(true);
    try {
      await resolveCorrection(item.id, action, adminNote.trim() || undefined);
      onResolved();
    } catch (e) {
      setMsg(`처리 실패: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-brand/15 p-4 space-y-3">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          item.status === "pending" ? "bg-amber-100 text-amber-900" : item.status === "accepted" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"
        }`}>{CORRECTION_STATUS_LABELS[item.status]}</span>
        <Link href={`/news/${item.idxno}`} target="_blank" className="font-semibold text-brand hover:underline">
          {item.title ?? `기사 ${item.idxno}`} ↗
        </Link>
        <span className="text-xs text-foreground-muted">{item.publishedAt} · 요청 {item.createdAt?.slice(0, 16)} · {item.uid.slice(0, 10)}…</span>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-red-50 border border-red-200 p-2.5">
          <p className="text-xs font-semibold text-red-800">지목 원문</p>
          <p className="mt-1 whitespace-pre-wrap">{item.selectedText}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5">
          <p className="text-xs font-semibold text-emerald-800">제안 문구</p>
          <p className="mt-1 whitespace-pre-wrap">{item.suggestion}</p>
        </div>
      </div>
      {item.note && <p className="text-sm text-foreground-muted">사유: {item.note}</p>}
      {item.adminNote && <p className="text-sm text-foreground-muted">처리 메모: {item.adminNote}</p>}

      {item.status === "pending" && (
        <>
          <button type="button" onClick={() => setOpen(!open)} className="text-sm font-semibold text-accent hover:underline" aria-expanded={open}>
            {open ? "▲ 처리 닫기" : "▼ 본문 확인·수정하고 처리하기"}
          </button>
          {open && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={applySuggestion}
                  disabled={occurrences !== 1 || busy}
                  className="rounded border border-brand/30 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand hover:text-background disabled:opacity-40"
                  title={occurrences === 0 ? "지목 원문이 본문에 없습니다(이미 수정됐거나 불일치)" : occurrences > 1 ? `본문에 ${occurrences}회 등장 — 수동으로 고쳐주세요` : "1회 일치 — 안전하게 치환"}
                >
                  제안대로 치환 {occurrences === 1 ? "" : `(일치 ${occurrences}회)`}
                </button>
                <button type="button" onClick={saveBody} disabled={busy} className="rounded bg-brand px-2.5 py-1 text-xs font-semibold text-background disabled:opacity-40">
                  본문 저장
                </button>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-brand/20 bg-background p-2.5 font-mono text-sm leading-relaxed"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  maxLength={300}
                  placeholder="처리 메모(요청자에게 표시, 선택)"
                  className="min-w-0 flex-1 rounded-lg border border-brand/20 bg-background px-2.5 py-1.5 text-sm"
                />
                <button type="button" onClick={() => resolve("accept")} disabled={busy} className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                  ✓ 반영 완료
                </button>
                <button type="button" onClick={() => resolve("reject")} disabled={busy} className="rounded bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                  반려
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {msg && <p className="text-sm text-brand">{msg}</p>}
    </li>
  );
}
