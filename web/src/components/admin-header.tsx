"use client";

// 관리자(운영 콘솔) 전용 헤더 — 공개 사이트와 시각적으로 완전히 분리.
// 다크 슬레이트 배경 + ADMIN 배지 + 섹션 점프 네비 + 공개 사이트 복귀 버튼.

import Link from "next/link";

const ADMIN_SECTIONS = [
  { href: "#cost-heading", label: "비용" },
  { href: "#review-heading", label: "AI 검수" },
  { href: "#citizen-heading", label: "시민기자" },
  { href: "#governance-heading", label: "민감규칙" },
  { href: "#ebook-heading", label: "전자북 검수" },
];

export function AdminHeader() {
  return (
    <header className="sticky top-0 z-50 bg-[#10182b] text-slate-200 shadow-lg">
      {/* 경고색 상단 라인 — 한눈에 '관리자 영역' */}
      <div
        className="h-1 bg-[repeating-linear-gradient(45deg,#f59e0b_0,#f59e0b_12px,#10182b_12px,#10182b_24px)]"
        aria-hidden="true"
      />
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold tracking-wider text-white">
            ADMIN
          </span>
          <span className="flex flex-col leading-none min-w-0">
            <span className="text-[10px] uppercase tracking-widest text-slate-400">Taean Insight</span>
            <span className="truncate font-bold text-white">운영 콘솔</span>
          </span>
        </div>

        <nav aria-label="관리자 섹션" className="hidden items-center gap-5 text-sm md:flex">
          {ADMIN_SECTIONS.map((s) => (
            <a key={s.href} href={s.href} className="text-slate-300 transition-colors hover:text-amber-400">
              {s.label}
            </a>
          ))}
        </nav>

        <Link
          href="/"
          className="shrink-0 rounded border border-slate-500 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-amber-400 hover:text-amber-400"
        >
          ← 공개 사이트
        </Link>
      </div>
      {/* 내부용 고지 스트립 */}
      <div className="border-t border-white/10 bg-black/20">
        <p className="container mx-auto max-w-6xl px-4 py-1 text-[11px] text-slate-400">
          🔒 내부 운영 도구 — 이 화면은 태안신문사 관리자 전용이며 외부 공유·노출을 금지합니다.
        </p>
      </div>
    </header>
  );
}

export function AdminFooter() {
  return (
    <footer className="mt-12 bg-[#10182b] py-5 text-center text-xs text-slate-400">
      TAEAN INSIGHT 운영 콘솔 · 내부 전용 · © 태안신문
    </footer>
  );
}
