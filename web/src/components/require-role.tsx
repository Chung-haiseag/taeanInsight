"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

import { getSession } from "@/lib/api/auth";
import { hasRole, type Role } from "@/lib/roles";

type Gate = "checking" | "ok" | "denied";

// 등급 가드(UX). 비로그인→/login?redirect=, 등급부족→안내, 충족→children.
export function RequireRole({ minRole, children }: { minRole: Role; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    let alive = true;
    getSession()
      .then((acct) => {
        if (!alive) return;
        if (!acct) {
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return; // checking 유지(리다이렉트 중)
        }
        setGate(hasRole(acct.role, minRole) ? "ok" : "denied");
      })
      .catch(() => {
        if (alive) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      });
    return () => { alive = false; };
  }, [minRole, pathname, router]);

  if (gate === "checking") return <p className="p-6 text-sm text-foreground-muted">확인 중…</p>;
  if (gate === "denied")
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-bold text-brand">접근 권한이 없습니다</h1>
        <p className="text-sm text-foreground-muted">이 메뉴는 상위 등급 회원 전용입니다.</p>
        <Link href="/membership" className="inline-flex rounded-full border border-brand/20 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/5">멤버십 안내</Link>
      </div>
    );
  return <>{children}</>;
}
