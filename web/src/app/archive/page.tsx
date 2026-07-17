// 통합 이후 아카이브는 뉴스아카이브(/news)로 통합됨 — 기존 딥링크 보존용 리다이렉트.
import { redirect } from "next/navigation";

export default function ArchiveRedirect() {
  redirect("/news");
}
