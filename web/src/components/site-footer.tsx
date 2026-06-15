"use client";

import { usePathname } from "next/navigation";
import { AdminFooter } from "./admin-header";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return <AdminFooter />;
  return (
    <footer className="bg-brand text-background/90 mt-24">
      <div className="h-1 bg-gradient-to-r from-transparent via-accent/60 to-accent" aria-hidden="true" />
      <div className="container mx-auto px-4 max-w-7xl py-12 grid gap-8 md:grid-cols-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-kicker text-accent-subtle mb-2">Taean Insight</p>
          <p className="font-bold text-base mb-2">태안 AI 인텔리전스</p>
          <p className="text-background/70 leading-relaxed">
            태안의 관광·환경·부동산 예측 인사이트를 AI로.
            <br />
            insight.taeannews.co.kr
          </p>
        </div>
        <div>
          <p className="font-semibold mb-2">운영</p>
          <ul className="space-y-1 text-background/70">
            <li>발행: 태안신문</li>
            <li>주관: (주)엔씨투</li>
            <li>문의: taeannews@taeannews.co.kr</li>
            <li>전화: 041-670-1234</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold mb-2">윤리·정책</p>
          <ul className="space-y-1 text-background/70">
            <li>모든 AI 보조 콘텐츠에 [AI 보조] 라벨 명시</li>
            <li>모든 발행물은 편집부 검토(HITL) 거침</li>
            <li>개인정보보호법·KISA 처리방침 준수</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-background/10 py-3 text-center text-xs text-background/60">
        © 2026 태안신문 · 지역신문발전위원회 지원 사업
        <span className="mx-2 text-background/30">·</span>
        <a href="/admin" className="text-background/50 hover:text-background/80 underline">
          관리자
        </a>
      </div>
    </footer>
  );
}
