import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "태안뉴스",
  description: "주간태안신문의 최신 기사를 관심 도메인별로 모았습니다. 태안의 오늘을 한눈에.",
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
