"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSession, logout, type Account } from "@/lib/api/auth";

export function AccountNav() {
  const [acct, setAcct] = useState<Account | null | undefined>(undefined); // undefined=로딩
  useEffect(() => { getSession().then(setAcct).catch(() => setAcct(null)); }, []);

  if (acct === undefined) return null;

  if (!acct) {
    return (
      <Link href="/login" className="hidden md:inline-flex items-center rounded-full border border-brand/20 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/5">
        로그인
      </Link>
    );
  }
  const label = acct.displayName || acct.email.split("@")[0];
  return (
    <div className="hidden md:flex items-center gap-2 text-xs">
      <Link href="/account" className="font-semibold text-brand hover:underline" title={acct.email}>👤 {label}</Link>
      <button type="button" onClick={async () => { await logout(); location.reload(); }} className="text-foreground-muted hover:text-brand">로그아웃</button>
    </div>
  );
}
