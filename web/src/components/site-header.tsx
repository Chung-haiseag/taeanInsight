"use client";

// 사이트 머리 — 2026-10 신문 1면 리디자인.
//   1행(네이비 띠, 스크롤되면 사라짐): 오늘 날짜 + 보기 설정(글자 크기·고대비) — 고령 독자가 늘 찾는 도구라 맨 위.
//   2행(고정): 제호 · 주 메뉴(등급별) · '태안에 대해 물어보세요' · 계정. 좁은 화면은 메뉴를 햄버거로 접는다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAccessibility } from "./accessibility-provider";
import { AdminHeader } from "./admin-header";
import { AccountNav } from "./account-nav";
import { navActive, visibleNav } from "@/lib/nav";
import { cachedRole, getSession } from "@/lib/api/auth";
import { getKgStatus } from "@/lib/api/kg-public";

// 인물 탐색 공개 여부(모듈 캐시 — 세션 내 1회 조회). 기본 노출(true).
let _peopleOn: boolean | null = null;

const SIZE_LABEL = { base: "보통", large: "크게", xlarge: "아주 크게" } as const;

/** 한국 시간 기준 '2026년 10월 2일 금요일' — 서버 렌더와 어긋나지 않게 마운트 뒤에만 그린다. */
function todayKo(): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
}

export function SiteHeader() {
  const { fontSize, setFontSize, theme, setTheme } = useAccessibility();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [peopleOn, setPeopleOn] = useState<boolean>(_peopleOn ?? true);
  const [today, setToday] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // 캐시 role로 즉시 렌더 후, 세션으로 최신화(로그인/등급 변경 반영)
  useEffect(() => {
    setRole(cachedRole());
    getSession().then((a) => setRole(a?.role ?? null)).catch(() => {});
  }, [pathname]);
  // 인물 탐색 공개 여부 — 세션 내 1회 조회(모듈 캐시). 비활성이면 nav에서 숨김.
  useEffect(() => {
    if (_peopleOn !== null) { setPeopleOn(_peopleOn); return; }
    getKgStatus().then((s) => { _peopleOn = s.enabled; setPeopleOn(s.enabled); }).catch(() => {});
  }, []);
  useEffect(() => { setToday(todayKo()); }, []);
  const navItems = visibleNav(role).filter((i) => i.href !== "/people" || peopleOn);

  // 경로 바뀌면 모바일 메뉴 닫기
  useEffect(() => { setOpen(false); }, [pathname]);

  // 관리자 영역은 공개 사이트와 완전히 다른 운영 콘솔 크롬 사용
  if (pathname.startsWith("/admin")) return <AdminHeader />;

  const isActive = (href: string) => navActive(pathname, href);   // 판정은 lib/nav.ts 한 곳

  function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    const url = text ? `/query?q=${encodeURIComponent(text)}` : "/query";
    // 질의 화면에서 또 물으면 같은 화면이라 다시 마운트되지 않는다 — 새로 불러 질문을 받게 한다.
    if (pathname === "/query") window.location.assign(url);
    else router.push(url);
  }

  const pill = (on: boolean) =>
    `min-h-11 rounded-full border px-3 text-[0.8rem] md:min-h-[30px] ${on ? "border-ti-on-navy bg-ti-on-navy text-ti-navy-deep" : "border-white/30 text-ti-on-navy"}`;

  return (
    <>
      {/* 1행: 날짜 · 보기 설정 */}
      <div className="on-dark no-print bg-ti-navy-deep text-[0.82rem] text-ti-on-navy-muted">
        <div className="container mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-5 gap-y-1 px-4 py-1.5">
          <p className="min-h-[1.5em]">
            {today && <b className="font-semibold text-ti-on-navy">{today}</b>}
            <span className="hidden sm:inline">{today ? " · " : ""}태안신문이 만드는 AI 지역 리포트</span>
          </p>
          {/* 보기 설정 — 단추는 휴대폰에서 터치 타깃 44px(min-h-11). */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="보기 설정">
            <span className="mr-1" aria-hidden="true">글자 크기</span>
            {(["base", "large", "xlarge"] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setFontSize(size)}
                aria-pressed={fontSize === size}
                aria-label={`글자 크기 ${SIZE_LABEL[size]}`}
                className={pill(fontSize === size)}
              >
                {SIZE_LABEL[size]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTheme(theme === "default" ? "highcontrast" : "default")}
              aria-pressed={theme === "highcontrast"}
              className={pill(theme === "highcontrast")}
            >
              고대비
            </button>
          </div>
        </div>
      </div>

      {/* 2행: 제호 · 메뉴 · 질문 · 계정 (고정) */}
      <header className="sticky top-0 z-50 border-b border-ti-line bg-ti-surface">
        <div className="container mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-3 text-ti-ink" aria-label="태안 인사이트 홈">
            <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" focusable="false" className="shrink-0">
              <rect width="40" height="40" rx="10" fill="var(--ti-navy)" />
              <path d="M6 25 C11 18,15 18,20 24 S29 30,34 22" fill="none" stroke="#7FD3DB" strokeWidth="2.6" strokeLinecap="round" />
              <circle cx="29" cy="12" r="3.2" fill="#F0CB82" />
            </svg>
            <span>
              <strong className="block font-head text-[1.45rem] font-black leading-tight tracking-[-0.02em]">태안 인사이트</strong>
              <small className="block text-[0.74rem] tracking-[0.08em] text-ti-muted">태안신문 · AI 지역 리포트</small>
            </span>
          </Link>

          <nav aria-label="주 메뉴" className="hidden lg:block">
            <ul className="flex flex-wrap items-center gap-1">
              {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      // 칸의 색은 **지금 보고 있는가**만 말한다 — 채움 + 진한 글씨 + 3px 밑줄.
                      //   ⚠ 고대비 모드에선 --ti-petrol-soft 가 흰색이라 채움이 사라진다.
                      //     그래서 밑줄과 글자색을 함께 둔다 — 하나가 없어져도 표시가 남는다.
                      //   ⚠ 멤버십을 가입 단추처럼 늘 네이비로 칠해 두었더니, 홈에 있어도
                      //     멤버십이 켜진 것처럼 보였다(2026-11-06 사용자 지적). 파는 것이라고
                      //     늘 칠하면 하이라이트가 거짓말이 된다 — 예외를 없앴다.
                      className={`block rounded-lg px-3 py-2 text-[0.95rem] transition-colors hover:bg-ti-sunk hover:text-ti-ink ${
                        active
                          ? "bg-ti-petrol-soft font-bold text-ti-petrol-ink shadow-[inset_0_-3px_0_var(--ti-petrol)]"
                          : "font-semibold text-ti-ink2"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            {/* 질문 칸은 한 줄에 다 들어가는 폭(1200px~)에서만. 그보다 좁으면 짧은 '질문' 단추로 /query 에 보낸다
                — 고정 머리가 두 줄로 늘면 본문을 너무 가린다. 휴대폰은 햄버거 안에 칸이 있다. */}
            <Link href="/query" className="hidden min-h-11 items-center rounded-full bg-ti-petrol px-4 text-[0.88rem] font-bold text-white md:inline-flex min-[1200px]:hidden">
              질문하기
            </Link>
            <form role="search" onSubmit={ask} className="hidden items-center gap-1.5 rounded-full border border-ti-line bg-ti-paper py-1 pl-4 pr-1 focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[var(--ti-focus)] min-[1200px]:flex">
              <label htmlFor="site-ask" className="sr-only">태안에 대해 질문하기</label>
              <input
                id="site-ask"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="태안에 대해 물어보세요"
                className="w-40 min-w-0 border-0 bg-transparent text-[0.9rem] text-ti-ink placeholder:text-ti-muted focus:outline-none"
              />
              <button type="submit" className="min-h-9 rounded-full bg-ti-petrol px-3.5 text-[0.85rem] font-bold text-white">질문</button>
            </form>
            <AccountNav />
            {/* 좁은 화면 햄버거 */}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-ti-line text-ti-ink lg:hidden"
            >
              {open ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
              )}
            </button>
          </div>
        </div>

        {/* 모바일 메뉴 패널 */}
        {open && (
          <div id="mobile-menu" className="border-t border-ti-line bg-ti-surface lg:hidden">
            <nav aria-label="주 메뉴(모바일)" className="container mx-auto max-w-[1200px] px-4 py-2">
              <form role="search" onSubmit={ask} className="my-2 flex items-center gap-1.5 rounded-full border border-ti-line bg-ti-paper py-1 pl-4 pr-1 md:hidden">
                <label htmlFor="site-ask-m" className="sr-only">태안에 대해 질문하기</label>
                <input
                  id="site-ask-m"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="태안에 대해 물어보세요"
                  className="min-w-0 flex-1 border-0 bg-transparent text-base text-ti-ink placeholder:text-ti-muted focus:outline-none"
                />
                <button type="submit" className="min-h-10 rounded-full bg-ti-petrol px-4 text-sm font-bold text-white">질문</button>
              </form>
              <ul className="divide-y divide-ti-line">
                {navItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center justify-between py-3 text-base ${active ? "font-semibold text-ti-ink" : "text-ti-ink2"}`}
                      >
                        {item.label}
                        {active && <span className="h-2 w-2 rounded-full bg-ti-petrol" aria-hidden="true" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
