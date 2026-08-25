"use client";

// 관리자 — 멤버십 입금 확인 탭.
//
//   여기가 **등급을 여는 유일한 문**이다. 통장에 찍힌 입금자명·금액을 목록과 맞춰 보고
//   '입금 확인'을 누르면 그때 회원이 된다(서버가 만료일을 계산해 붙인다).
//   ⚠ 확인은 되돌리기 번거로우니 한 번 더 묻는다. 이미 확인된 주문은 서버가 두 번 처리하지 않는다.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

interface Order {
  code: string; user_id: number; months: number; amount: number;
  depositor: string; contact: string | null; status: string;
  created_at: string; confirmed_at: string | null; note: string | null;
  email: string | null; display_name: string | null; plan: string | null; plan_until: string | null;
}

const STATUSES = [
  { key: "pending", label: "입금 대기" },
  { key: "paid", label: "확인 완료" },
  { key: "cancelled", label: "취소" },
] as const;

const won = (n: number) => n.toLocaleString("ko-KR");
const when = (s: string | null) => (s ? `${s.slice(5, 7)}.${s.slice(8, 10)} ${s.slice(11, 16)}` : "—");

export function MembershipSection() {
  const [status, setStatus] = useState<string>("pending");
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [bank, setBank] = useState("");
  const [phone, setPhone] = useState("");
  const [savedInfo, setSavedInfo] = useState<{ bank: string | null; phone: string | null }>({ bank: null, phone: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ items: Order[] }>(`/api/admin/membership/orders?status=${status}`);
      setItems(r.items ?? []);
    } catch { setItems([]); } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  // 계좌·문의처는 가입 화면이 그대로 보여주는 값이라, 비어 있으면 신청자가 입금할 곳을 못 본다.
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev"}/api/membership/terms`)
      .then((r) => r.json())
      .then((d: { bank: string | null; phone: string | null }) => {
        setSavedInfo({ bank: d.bank, phone: d.phone });
        setBank(d.bank ?? ""); setPhone(d.phone ?? "");
      })
      .catch(() => {});
  }, []);

  async function confirm(o: Order) {
    if (!window.confirm(`${o.depositor} 님 ${won(o.amount)}원(${o.months}개월) 입금을 확인하셨습니까?\n확인하면 바로 멤버십이 열립니다.`)) return;
    try {
      const r = await apiFetch<{ ok: boolean; until: string }>(`/api/admin/membership/orders/${o.code}/confirm`, { method: "POST" });
      setMsg(`${o.depositor} 님 멤버십이 열렸습니다 (${r.until.slice(0, 10)}까지)`);
      void load();
    } catch { setMsg("확인에 실패했습니다."); }
  }

  async function cancel(o: Order) {
    const note = window.prompt("취소 사유(선택)") ?? "";
    try {
      await apiFetch(`/api/admin/membership/orders/${o.code}/cancel`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note }),
      });
      setMsg(`${o.code} 취소했습니다.`); void load();
    } catch { setMsg("취소에 실패했습니다."); }
  }

  async function saveSettings() {
    try {
      const r = await apiFetch<{ bank: string | null; phone: string | null }>("/api/admin/membership/settings", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bank, phone }),
      });
      setSavedInfo({ bank: r.bank, phone: r.phone });
      setMsg("입금 계좌·문의처를 저장했습니다.");
    } catch { setMsg("저장에 실패했습니다."); }
  }

  return (
    <div className="space-y-6">
      {/* 계좌·문의처 — 비어 있으면 가입 화면에서 입금할 곳이 안 보인다. 맨 위에 둔다. */}
      <section className={`rounded-xl border p-4 ${savedInfo.bank ? "border-brand/15" : "border-red-300 bg-red-50"}`}>
        <h3 className="font-bold text-brand">입금 계좌 · 문의 전화</h3>
        {!savedInfo.bank && (
          <p className="mt-1 text-sm font-semibold text-red-700">
            계좌가 비어 있습니다 — 지금 가입 화면에서 신청자가 입금할 곳을 볼 수 없습니다.
          </p>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-foreground-muted">계좌(은행·번호·예금주)</span>
            <input value={bank} onChange={(e) => setBank(e.target.value)}
              placeholder="농협 301-0000-0000-00 태안신문"
              className="mt-1 w-full rounded border border-brand/20 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm text-foreground-muted">문의 전화</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="041-000-0000"
              className="mt-1 w-full rounded border border-brand/20 px-3 py-2 text-sm" />
          </label>
        </div>
        <button type="button" onClick={saveSettings}
          className="mt-3 rounded bg-brand px-4 py-2 text-sm font-semibold text-background">저장</button>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button key={s.key} type="button" onClick={() => setStatus(s.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${status === s.key ? "bg-brand text-background" : "border border-brand/20 text-brand hover:bg-brand/5"}`}>
            {s.label}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="ml-auto text-sm text-foreground-muted underline">새로고침</button>
      </div>

      {msg && <p className="rounded bg-accent-subtle/40 px-3 py-2 text-sm text-brand">{msg}</p>}
      {loading && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {!loading && items.length === 0 && <p className="text-sm text-foreground-muted">해당하는 신청이 없습니다.</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-brand/15 text-left text-foreground-muted">
              <th className="py-2 pr-3 font-normal">신청번호</th>
              <th className="py-2 pr-3 font-normal">입금자명</th>
              <th className="py-2 pr-3 font-normal">금액·기간</th>
              <th className="py-2 pr-3 font-normal">계정</th>
              <th className="py-2 pr-3 font-normal">신청</th>
              <th className="py-2 font-normal">처리</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.code} className="border-b border-brand/5 align-top">
                <td className="py-2 pr-3 font-mono text-xs">{o.code}</td>
                <td className="py-2 pr-3">
                  <span className="font-bold text-brand">{o.depositor}</span>
                  {o.contact && <span className="block text-xs text-foreground-muted">{o.contact}</span>}
                </td>
                <td className="py-2 pr-3 tabular-nums">{won(o.amount)}원 <span className="text-foreground-muted">({o.months}개월)</span></td>
                <td className="py-2 pr-3 text-xs">
                  {o.email ?? `#${o.user_id}`}
                  {o.plan_until && <span className="block text-foreground-muted">~{o.plan_until.slice(0, 10)}</span>}
                </td>
                <td className="py-2 pr-3 text-xs text-foreground-muted">{when(o.created_at)}</td>
                <td className="py-2">
                  {o.status === "pending" ? (
                    <span className="flex gap-2">
                      <button type="button" onClick={() => confirm(o)}
                        className="rounded bg-accent px-3 py-1.5 text-xs font-bold text-background">입금 확인</button>
                      <button type="button" onClick={() => cancel(o)}
                        className="rounded border border-brand/20 px-2 py-1.5 text-xs text-foreground-muted">취소</button>
                    </span>
                  ) : (
                    <span className="text-xs text-foreground-muted">
                      {o.status === "paid" ? `확인 ${when(o.confirmed_at)}` : `취소${o.note ? ` · ${o.note}` : ""}`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
