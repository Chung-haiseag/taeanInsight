"use client";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/api/auth";
import { applyCitizen, getMyApplication, type MyCitizenApp } from "@/lib/api/citizen-apply";

const STATUS_LABEL: Record<string, string> = { pending: "심사 중", approved: "승인됨", rejected: "반려됨" };

export function CitizenApply() {
  const [role, setRole] = useState<string | null>(null);
  const [app, setApp] = useState<MyCitizenApp | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => {
    getSession().then((a) => setRole(a?.role ?? null)).catch(() => {});
    getMyApplication().then((r) => setApp(r.application)).catch(() => {});
  }, []);
  if (role === null) return null; // 비로그인/로딩
  if (role !== "user") return null; // 이미 시민기자 이상이면 숨김

  async function submit() {
    setBusy(true);
    try { await applyCitizen(reason.trim() || undefined); setApp({ id: 0, status: "pending", reason: reason.trim() || null, applied_at: "" }); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-brand/20 bg-background p-4 text-sm">
      <p className="mb-2 font-semibold text-brand">🖊 시민기자 신청</p>
      {app && app.status !== "rejected" ? (
        <p className="text-foreground-muted">신청 상태: <strong className="text-brand">{STATUS_LABEL[app.status] ?? app.status}</strong>{app.status === "approved" ? " — 이제 글을 투고할 수 있습니다." : " — 관리자 승인을 기다리는 중입니다."}</p>
      ) : (
        <div className="space-y-2">
          {app?.status === "rejected" && <p className="text-xs text-red-600">이전 신청이 반려되었습니다{app.reason ? `: ${app.reason}` : ""}. 다시 신청할 수 있습니다.</p>}
          <p className="text-foreground-muted">태안 소식을 직접 취재·투고하고 싶으신가요? 신청하면 관리자 승인 후 글쓰기가 열립니다.</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="신청 사유(선택)" className="w-full rounded border border-brand/20 bg-background px-2 py-1 text-xs" />
          <button type="button" onClick={submit} disabled={busy} className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60">{busy ? "신청 중…" : "시민기자 신청"}</button>
        </div>
      )}
    </div>
  );
}
