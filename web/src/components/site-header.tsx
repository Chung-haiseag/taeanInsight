"use client";

import Link from "next/link";
import { useAccessibility } from "./accessibility-provider";

const NAV_ITEMS = [
  { href: "/reports", label: "주간 리포트" },
  { href: "/query", label: "AI 질의" },
  { href: "/dashboard", label: "B2B 대시보드" },
  { href: "/citizen", label: "시민기자" },
  { href: "/me", label: "내 페이지" },
];

export function SiteHeader() {
  const { fontSize, setFontSize, theme, setTheme } = useAccessibility();

  return (
    <header className="border-b border-brand/10 bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-6xl flex items-center justify-between h-16">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-brand"
          aria-label="태안 AI 인텔리전스 홈"
        >
          <span className="inline-block w-2 h-6 bg-accent rounded" aria-hidden="true" />
          태안 AI 인텔리전스
        </Link>

        <nav aria-label="주요 메뉴" className="hidden md:flex gap-6">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-foreground-muted hover:text-brand transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2" role="toolbar" aria-label="접근성 옵션">
          <fieldset className="flex items-center gap-1 border border-brand/20 rounded p-1">
            <legend className="sr-only">글자 크기</legend>
            {(["base", "large", "xlarge"] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setFontSize(size)}
                aria-pressed={fontSize === size}
                aria-label={`글자 크기 ${size === "base" ? "기본" : size === "large" ? "크게" : "매우 크게"}`}
                className={`px-2 py-0.5 text-xs rounded ${
                  fontSize === size ? "bg-brand text-background" : "text-foreground-muted"
                }`}
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
      </div>
    </header>
  );
}
