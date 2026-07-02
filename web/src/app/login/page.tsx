"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login, signup, startKakaoLogin, consumeKakaoCallback } from "@/lib/api/auth";

const ERR: Record<string, string> = {
  email_taken: "이미 가입된 이메일입니다.",
  invalid_credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
  invalid_input: "이메일과 8자 이상 비밀번호를 입력하세요.",
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 카카오 콜백 처리 — kakao_token 있으면 로그인 완료 → /me
  useEffect(() => {
    if (consumeKakaoCallback()) { router.push("/me"); return; }
    const p = new URLSearchParams(window.location.search);
    if (p.get("error")?.startsWith("kakao")) setErr("카카오 로그인에 실패했습니다. 다시 시도해 주세요.");
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = mode === "login" ? await login(email, pw) : await signup(email, pw, name || undefined);
      if (r.ok) router.push("/me");
      else setErr(ERR[r.error ?? ""] ?? r.error ?? "실패했습니다.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="text-2xl font-bold text-brand">{mode === "login" ? "로그인" : "회원가입"}</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        로그인하면 관심사·읽은 기사·알림이 <strong>모든 기기에서 동기화</strong>됩니다.
      </p>

      <button type="button" onClick={startKakaoLogin}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#FEE500] px-4 py-2.5 text-sm font-bold text-[#191919] hover:brightness-95">
        <span aria-hidden>💬</span> 카카오로 시작하기
      </button>
      <div className="my-4 flex items-center gap-3 text-xs text-foreground-muted">
        <span className="h-px flex-1 bg-brand/10" /> 또는 이메일 <span className="h-px flex-1 bg-brand/10" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름(선택)" maxLength={40}
            className="w-full rounded-lg border border-brand/20 px-3 py-2.5 text-sm" />
        )}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" required autoComplete="email"
          className="w-full rounded-lg border border-brand/20 px-3 py-2.5 text-sm" />
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호(8자 이상)" required minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="w-full rounded-lg border border-brand/20 px-3 py-2.5 text-sm" />
        {err && <p className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button type="submit" disabled={busy}
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-background hover:bg-brand/90 disabled:opacity-60">
          {busy ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
        </button>
      </form>

      <div className="mt-4 text-center text-sm text-foreground-muted">
        {mode === "login" ? (
          <>계정이 없으신가요? <button onClick={() => { setMode("signup"); setErr(null); }} className="font-semibold text-accent hover:underline">회원가입</button></>
        ) : (
          <>이미 계정이 있으신가요? <button onClick={() => { setMode("login"); setErr(null); }} className="font-semibold text-accent hover:underline">로그인</button></>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-foreground-muted">
        <Link href="/me" className="hover:text-brand">로그인 없이 둘러보기 →</Link>
      </p>
    </div>
  );
}
