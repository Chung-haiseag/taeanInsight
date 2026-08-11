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
  const grade = acct.role ? ROLE_LABEL[acct.role] ?? acct.role : null;
  return (
    <div className="hidden md:flex items-center gap-2 text-xs">
      <Link href="/account" className="font-semibold text-brand hover:underline" title={acct.email}><Icon name="user" /> {label}</Link>
      {grade && (
        <span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${GRADE_STYLE[acct.role ?? ""] ?? "bg-brand/10 text-brand"}`}>
          {grade}
        </span>
      )}
      <button type="button" onClick={async () => { await logout(); location.reload(); }} className="text-foreground-muted hover:text-brand">로그아웃</button>
    </div>
  );
}

// 등급 라벨·색상 — 상위 등급일수록 눈에 띄게.
const ROLE_LABEL: Record<string, string> = {
  user: "일반회원",
  citizen: "시민기자",
  reporter: "기자",
  admin: "관리자",
  superadmin: "최종관리자",
};
const GRADE_STYLE: Record<string, string> = {
  user: "bg-foreground-muted/15 text-foreground-muted",
  citizen: "bg-emerald-100 text-emerald-700",
  reporter: "bg-blue-100 text-blue-700",
  admin: "bg-amber-100 text-amber-800",
  superadmin: "bg-red-100 text-red-700",
};
