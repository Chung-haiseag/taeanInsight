"use client";

// 내 페이지 — 내 수정 요청 목록(전자북 기사 오탈자 제보 처리 현황).
// 요청이 하나도 없으면 아무것도 렌더하지 않음.

import { useEffect, useState } from "react";
import Link from "next/link";

import { getMyCorrections, CORRECTION_STATUS_LABELS, type MyCorrection } from "@/lib/api/corrections";

export function MyCorrections() {
  const [items, setItems] = useState<MyCorrection[]>([]);

  useEffect(() => {
    getMyCorrections().then((r) => setItems(r.items ?? [])).catch(() => setItems([]));
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="card p-5 sm:p-6 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold text-brand">✏️ 내 수정 요청</h2>
        <span className="text-xs text-foreground-muted">옛 신문 오탈자 제보 · 관리자 검토 후 반영</span>
      </div>
      <ul className="divide-y divide-brand/10">
        {items.slice(0, 8).map((it) => (
          <li key={it.id} className="py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                it.status === "pending" ? "bg-amber-100 text-amber-900" : it.status === "accepted" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"
              }`}>{CORRECTION_STATUS_LABELS[it.status]}</span>
              <Link href={`/news/${it.idxno}`} className="min-w-0 flex-1 truncate font-semibold text-brand hover:underline">
                {it.title ?? `기사 ${it.idxno}`}
              </Link>
              <span className="text-xs text-foreground-muted">{it.createdAt?.slice(0, 10)}</span>
            </div>
            <p className="mt-1 text-foreground-muted">
              “{it.selectedText}” → “{it.suggestion}”
            </p>
            {it.adminNote && <p className="mt-0.5 text-xs text-foreground-muted">관리자: {it.adminNote}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
