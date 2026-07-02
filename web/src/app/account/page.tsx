"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession, updateProfile, changePassword, deleteAccount, logout, type Account } from "@/lib/api/auth";

export default function AccountPage() {
  const router = useRouter();
  const [acct, setAcct] = useState<Account | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [cur, setCur] = useState(""); const [nw, setNw] = useState("");

  useEffect(() => {
    getSession().then((a) => { setAcct(a); if (a) setName(a.displayName || ""); if (a === null) router.push("/login"); }).catch(() => setAcct(null));
  }, [router]);

  if (acct === undefined) return <div className="py-12 text-center text-foreground-muted">불러오는 중…</div>;
  if (!acct) return null;
  const isSocial = acct.email.endsWith("@kakao.local");

  async function saveName() {
    const r = await updateProfile(name.trim());
    setMsg(r.ok ? { kind: "ok", text: "이름을 저장했습니다." } : { kind: "err", text: "저장 실패" });
  }
  async function savePw() {
    if (nw.length < 8) { setMsg({ kind: "err", text: "새 비밀번호는 8자 이상" }); return; }
    const r = await changePassword(cur, nw);
    if (r.ok) { setMsg({ kind: "ok", text: "비밀번호를 변경했습니다." }); setCur(""); setNw(""); }
    else setMsg({ kind: "err", text: r.error === "invalid_credentials" ? "현재 비밀번호가 틀립니다." : "변경 실패" });
  }
  async function removeAccount() {
    if (!window.confirm("정말 탈퇴하시겠어요? 계정과 개인화 설정이 삭제됩니다.")) return;
    const pw = isSocial ? undefined : window.prompt("확인을 위해 비밀번호를 입력하세요.") ?? "";
    const r = await deleteAccount(pw);
    if (r.ok) { alert("탈퇴가 완료되었습니다."); location.href = "/"; }
    else setMsg({ kind: "err", text: r.error === "invalid_credentials" ? "비밀번호가 틀립니다." : "탈퇴 실패" });
  }

  return (
    <div className="mx-auto max-w-md space-y-8 py-8">
      <header>
        <h1 className="text-2xl font-bold text-brand">계정 설정</h1>
        <p className="mt-1 text-sm text-foreground-muted">{acct.email}{isSocial && " (카카오)"}</p>
      </header>

      {msg && <p className={`rounded p-3 text-sm border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold text-brand">표시 이름</h2>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="이름" className="flex-1 rounded-lg border border-brand/20 px-3 py-2 text-sm" />
          <button type="button" onClick={saveName} className="rounded-lg bg-brand px-4 text-sm font-semibold text-background">저장</button>
        </div>
      </section>

      {!isSocial && (
        <section className="space-y-2">
          <h2 className="font-semibold text-brand">비밀번호 변경</h2>
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="현재 비밀번호" className="w-full rounded-lg border border-brand/20 px-3 py-2 text-sm" />
          <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} placeholder="새 비밀번호(8자 이상)" className="w-full rounded-lg border border-brand/20 px-3 py-2 text-sm" />
          <button type="button" onClick={savePw} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-background">비밀번호 변경</button>
        </section>
      )}

      <section className="flex items-center justify-between border-t border-brand/10 pt-6">
        <button type="button" onClick={async () => { await logout(); location.href = "/"; }} className="text-sm text-foreground-muted hover:text-brand">로그아웃</button>
        <button type="button" onClick={removeAccount} className="text-sm text-red-600 hover:underline">회원 탈퇴</button>
      </section>

      <p className="text-center"><Link href="/me" className="text-xs text-foreground-muted hover:text-brand">← 내 페이지</Link></p>
    </div>
  );
}
