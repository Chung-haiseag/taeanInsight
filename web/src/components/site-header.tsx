"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccessibility } from "./accessibility-provider";
import { AdminHeader } from "./admin-header";
import { AccountNav } from "./account-nav";

const NAV_ITEMS = [
  { href: "/live", label: "지금 태안" },
  { href: "/news", label: "뉴스아카이브" },
  { href: "/reports", label: "주간 리포트" },
  { href: "/query", label: "질의응답" },
  { href: "/citizen", label: "시민기자" },
  { href: "/reporter", label: "취재 알림", reporterOnly: true },
  { href: "/membership", label: "멤버십" },
  { href: "/me", label: "내 페이지" },
] as { href: string; label: string; reporterOnly?: boolean }[];

// 기자 전용 메뉴 노출 — 계정 role(reporter/admin) 또는 이 기기에서 기자 등록 이력
function canSeeReporter(): boolean {
  try {
    const role = localStorage.getItem("taean-role");
    return role === "reporter" || role === "admin" || localStorage.getItem("taean-reporter") === "1";
  } catch { return false; }
}

export function SiteHeader() {
  const { fontSize, setFontSize, theme, setTheme } = useAccessibility();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showReporter, setShowReporter] = useState(false);
  useEffect(() => { setShowReporter(canSeeReporter()); }, [pathname]);
  const navItems = NAV_ITEMS.filter((i) => !i.reporterOnly || showReporter);

  // 경로 바뀌면 모바일 메뉴 닫기
  useEffect(() => { setOpen(false); }, [pathname]);

  // 관리자 영역은 공개 사이트와 완전히 다른 운영 콘솔 크롬 사용
  if (pathname.startsWith("/admin")) return <AdminHeader />;

  const A11y = ({ className = "" }: { className?: string }) => (
    <div className={`flex items-center gap-2 ${className}`} role="toolbar" aria-label="접근성 옵션">
      <fieldset className="flex items-center gap-1 border border-brand/20 rounded p-1">
        <legend className="sr-only">글자 크기</legend>
        {(["base", "large", "xlarge"] as const).map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => setFontSize(size)}
            aria-pressed={fontSize === size}
            aria-label={`글자 크기 ${size === "base" ? "기본" : size === "large" ? "크게" : "매우 크게"}`}
            className={`px-2 py-0.5 text-xs rounded ${fontSize === size ? "bg-brand text-background" : "text-foreground-muted"}`}
          >
            {size === "base" ? "가" : size === "large" ? "가+" : "가++"}
          </button>
        ))}
      </fieldset>
      <button
        type="button"
        onClick={() => setTheme(theme === "default" ? "highcontrast" : "default")}
        aria-pressed={theme === "highcontrast"}
        aria-label="고대비 모드"
        className="px-2 py-1 text-xs border border-brand/20 rounded text-foreground-muted hover:text-brand"
      >
        고대비
      </button>
    </div>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-brand/10 bg-background/80 backdrop-blur-md">
      {/* 상단 황토 라인 */}
      <div className="h-1 bg-gradient-to-r from-accent via-accent/60 to-transparent" aria-hidden="true" />
      <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2.5 text-brand" aria-label="태안 인사이트 홈">
          <span className="inline-block w-2 h-7 bg-accent rounded-sm" aria-hidden="true" />
          <span className="flex flex-col leading-none">
            <span className="text-[10px] uppercase tracking-kicker text-foreground-muted">Taean Insight</span>
            <span className="font-bold tracking-tight">태안 인사이트</span>
          </span>
        </Link>

        <nav aria-label="주요 메뉴" className="hidden md:flex gap-7 text-sm">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative py-1 transition-colors ${active ? "text-brand font-semibold" : "text-foreground-muted hover:text-brand"}`}
              >
                {item.label}
                {active && <span className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-accent" aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>

        {/* 데스크톱 접근성 + 계정 */}
        <A11y className="hidden md:flex" />
        <AccountNav />

        {/* 모바일 햄버거 */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-brand/20 text-brand"
        >
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          )}
        </button>
      </div>

      {/* 모바일 메뉴 패널 */}
      {open && (
        <div id="mobile-menu" className="md:hidden border-t border-brand/10 bg-background">
          <nav aria-label="주요 메뉴(모바일)" className="container mx-auto max-w-7xl px-4 py-2">
            <ul className="divide-y divide-brand/5">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center justify-between py-3 text-base ${active ? "font-semibold text-brand" : "text-foreground-muted"}`}
                    >
                      {item.label}
                      {active && <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-2 border-t border-brand/10 py-3">
              <span className="text-xs text-foreground-muted">화면 설정</span>
              <A11y />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
