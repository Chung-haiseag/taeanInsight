"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSession, logout, type Account } from "@/lib/api/auth";
import { Icon } from "@/components/icon";

export function AccountNav() {
  const [acct, setAcct] = useState<Account | null | undefined>(undefined); // undefined=로딩
  const pathname = usePathname();
  // 헤더 layout은 라우트 이동 시 재마운트되지 않으므로 pathname마다 세션 재조회(로그인 직후 반영).
  useEffect(() => { getSession().then(setAcct).catch(() => setAcct(null)); }, [pathname]);

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
      <Link href="/account" className="font-semibold text-brand hover:underline" title={acct.email}><Icon name="user" /> {label}</Link>
      <button type="button" onClick={async () => { await logout(); location.reload(); }} className="text-foreground-muted hover:text-brand">로그아웃</button>
    </div>
  );
}
