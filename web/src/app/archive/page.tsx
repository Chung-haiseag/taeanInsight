// 통합 이후 아카이브는 뉴스아카이브(/news)로 영구 통합됨 — 기존 딥링크·검색엔진 유입 보존용 308 영구 리다이렉트.
import { permanentRedirect } from "next/navigation";

export default function ArchiveRedirect() {
  permanentRedirect("/news");
}
