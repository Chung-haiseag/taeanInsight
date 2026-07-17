import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "뉴스아카이브",
  description: "태안신문 최신 기사부터 1990년 창간호까지 — 한 곳에서 보고 검색하세요.",
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
