"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

import { getSession } from "@/lib/api/auth";
import { hasRole, type Role } from "@/lib/roles";

type Gate = "checking" | "ok" | "denied";

// 등급 가드(UX). 비로그인→/login?redirect=, 등급부족→안내, 충족→children.
//
//   fallback 을 주면 **로그인 화면으로 보내지 않고** 그 자리에 fallback 을 그린다.
//   왜 필요한가: /reports 는 팟캐스트가 공개, 분석만 회원 전용이다. 리다이렉트하는 가드를
//   페이지 안에 두면 비로그인 독자가 공개된 팟캐스트를 **보기도 전에** 로그인으로 쫓겨난다
//   (2026-11-07). 페이지 한쪽만 잠글 때는 이 모드를 쓴다.
export function RequireRole({ minRole, deniedHint, fallback, children }: {
  minRole: Role;
  deniedHint?: { text: string; href: string; label: string };
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    let alive = true;
    getSession()
      .then((acct) => {
        if (!alive) return;
        if (!acct) {
          if (fallback !== undefined) { setGate("denied"); return; } // 쫓아내지 않고 그 자리에 안내
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return; // checking 유지(리다이렉트 중)
        }
        setGate(hasRole(acct.role, minRole) ? "ok" : "denied");
      })
      .catch(() => {
        if (!alive) return;
        if (fallback !== undefined) { setGate("denied"); return; }
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      });
    return () => { alive = false; };
  }, [minRole, pathname, router, fallback]);

  if (gate === "checking") return <p className="p-6 text-sm text-foreground-muted">확인 중…</p>;
  if (gate === "denied" && fallback !== undefined) return <>{fallback}</>;
  if (gate === "denied")
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-bold text-brand">접근 권한이 없습니다</h1>
        <p className="text-sm text-foreground-muted">{deniedHint?.text ?? "이 메뉴는 상위 등급 회원 전용입니다."}</p>
        <Link href={deniedHint?.href ?? "/membership"} className="inline-flex rounded-full border border-brand/20 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/5">{deniedHint?.label ?? "멤버십 안내"}</Link>
      </div>
    );
  return <>{children}</>;
}
