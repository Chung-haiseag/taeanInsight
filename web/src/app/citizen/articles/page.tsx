"use client";

// 내 기사 목록 — 시민기자 본인(uid)의 작성 기사. 상태별 관리·수정·삭제.
import { useEffect, useState } from "react";
import Link from "next/link";

import { listMyArticles, deleteArticle, STATUS_LABEL, type CitizenArticle } from "@/lib/api/citizen-articles";

const STATUS_STYLE: Record<CitizenArticle["status"], string> = {
  draft: "bg-brand/10 text-brand",
  submitted: "bg-amber-100 text-amber-800",
  reviewing: "bg-blue-100 text-blue-800",
  published: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
};

export default function MyArticlesPage() {
  const [items, setItems] = useState<CitizenArticle[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try { setItems(await listMyArticles()); } catch (e) { setErr(e instanceof Error ? e.message : "불러오기 실패"); }
  }
  useEffect(() => { void load(); }, []);

  async function remove(a: CitizenArticle) {
    if (!window.confirm(`"${a.title || "(제목 없음)"}" 기사를 삭제할까요?`)) return;
    setBusy(a.id);
    try { await deleteArticle(a.id); setItems((prev) => (prev ?? []).filter((x) => x.id !== a.id)); }
    catch { /* 무시 */ } finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow"><span className="inline-block w-6 h-px bg-accent" aria-hidden /> My Articles</p>
          <h1 className="mt-3 text-display-sm font-bold text-brand">내 기사</h1>
        </div>
        <Link href="/citizen/write" className="btn-accent">+ 새 기사 작성</Link>
      </header>

      {err && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{err}</p>}
      {!items && !err && <p className="py-10 text-center text-sm text-foreground-muted">불러오는 중…</p>}
      {items && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-brand/20 p-10 text-center">
          <p className="text-sm text-foreground-muted">아직 작성한 기사가 없습니다.</p>
          <Link href="/citizen/write" className="mt-3 inline-block font-semibold text-accent hover:underline">첫 기사 작성하기 →</Link>
        </div>
      )}

      <ul className="space-y-3">
        {(items ?? []).map((a) => (
          <li key={a.id} className="rounded-2xl border border-brand/10 bg-background p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  <span className="text-xs text-foreground-muted">{new Date(a.updatedAt).toLocaleDateString("ko-KR")}</span>
                </div>
                <p className="mt-1.5 truncate font-semibold text-brand">{a.title || "(제목 없음)"}</p>
                <p className="mt-0.5 line-clamp-1 text-sm text-foreground-muted">{a.body.replace(/!\[[^\]]*\]\([^)]+\)/g, "🖼 ").slice(0, 100) || "(본문 없음)"}</p>
                {a.status === "rejected" && a.reviewNotes && <p className="mt-1 text-xs text-red-600">반려 사유: {a.reviewNotes}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {(a.status === "draft" || a.status === "rejected") && (
                  <Link href={`/citizen/write?id=${a.id}`} className="text-sm font-semibold text-accent hover:underline">수정 →</Link>
                )}
                <button type="button" onClick={() => remove(a)} disabled={busy === a.id} className="text-xs text-foreground-muted hover:text-red-600 disabled:opacity-50">삭제</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
