"use client";

// 사이트 바닥 — 2026-10 신문 1면 리디자인(짙은 네이비 띠). 발행·운영·윤리 정보는 그대로 둔다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminFooter } from "./admin-header";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return <AdminFooter />;
  return (
    <footer className="on-dark mt-24 bg-ti-navy-deep text-[0.85rem] text-ti-on-navy-muted">
      <div className="container mx-auto grid max-w-[1200px] gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <p className="font-head text-lg font-black text-ti-on-navy">태안 인사이트</p>
          <p className="mt-2 leading-relaxed">
            태안신문이 만드는 AI 지역 리포트. 관광·바다·환경·부동산·지역경제를 매일 읽어 드립니다.
          </p>
          <p className="mt-2">axtaeannews.co.kr</p>
        </div>
        <div>
          <p className="mb-2 font-semibold text-ti-on-navy">운영</p>
          <ul className="space-y-1">
            <li>발행: 태안신문 · 충남 태안군 태안읍</li>
            <li>개발: (주)엔씨투</li>
            <li>
              문의·제보: <a href="mailto:taeannews@taeannews.co.kr" className="underline underline-offset-4 hover:text-ti-on-navy">taeannews@taeannews.co.kr</a>
            </li>
            <li>
              전화: <a href="tel:041-673-7762" className="underline underline-offset-4 hover:text-ti-on-navy">041-673-7762</a>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-ti-on-navy">윤리·정책</p>
          <ul className="space-y-1">
            <li>모든 AI 보조 콘텐츠에 [AI 보조] 라벨 명시</li>
            <li>모든 발행물은 편집부 검토(HITL) 거침</li>
            <li>개인정보보호법·KISA 처리방침 준수</li>
            <li>스크린리더·큰 글씨·고대비 지원</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="container mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs">
          <p>© 2026 태안신문 · 지역신문발전위원회 지원 사업</p>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <li><Link href="/news" className="hover:text-ti-on-navy hover:underline">뉴스아카이브</Link></li>
            <li><Link href="/membership" className="hover:text-ti-on-navy hover:underline">멤버십</Link></li>
            <li>
              <a href="/admin" className="inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1 font-semibold text-ti-on-navy hover:bg-white/10">
                관리자
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
