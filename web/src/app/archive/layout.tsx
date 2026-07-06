import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "기사 아카이브",
  description: "1990년 창간호부터 최신까지, 태안신문 37년 기록을 한 번에 검색하세요.",
};

export default function ArchiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
