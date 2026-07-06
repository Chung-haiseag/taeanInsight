"use client";

// 이메일 뉴스레터 구독 — 수집(동의). 발송은 추후(도메인 온보딩 후). 해지는 메일 내 링크.
import { useState } from "react";

import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api/client";

export function EmailSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setState("error"); return; }
    setState("sending");
    try {
      await apiFetch("/api/email/subscribe", { method: "POST", body: JSON.stringify({ email, source: "reports" }) });
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="no-print mt-10 rounded-2xl border border-accent/30 bg-accent-subtle/30 p-5 text-center text-sm text-brand">
        ✅ 구독 완료! 새 리포트가 나오면 이메일로 알려드릴게요.
      </div>
    );
  }

  return (
    <div className="no-print mt-10 card p-5">
      <p className="text-sm font-semibold text-brand"><Icon name="mail" /> 이메일로 주간 리포트 받기</p>
      <p className="mt-1 text-xs text-foreground-muted">매주 발행 시 요약을 메일로. 광고 없이, 언제든 해지 가능.</p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="btn-accent px-4 py-2 text-sm disabled:opacity-60"
        >
          {state === "sending" ? "구독 중…" : "구독"}
        </button>
      </form>
      {state === "error" && <p className="mt-2 text-xs text-red-600">이메일 형식을 확인해 주세요.</p>}
    </div>
  );
}
