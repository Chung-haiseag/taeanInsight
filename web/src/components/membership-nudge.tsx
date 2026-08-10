// 무료 콘텐츠 고접점에서 멤버십 사전신청으로 전환 유도(넛지). source는 utm_source로 전달되어
//   관리자 전환 퍼널 보고서에서 '어느 무료 지점이 리드를 만드는지' 출처별로 집계된다.
import Link from "next/link";

export function MembershipNudge({
  source, title, subtitle, cta = "멤버십 보기 →",
}: { source: string; title: string; subtitle: string; cta?: string }) {
  return (
    <aside className="no-print card-accent my-8 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-bold text-brand">{title}</p>
        <p className="mt-0.5 text-sm leading-snug text-foreground-muted">{subtitle}</p>
      </div>
      <Link
        href={`/membership?utm_source=${encodeURIComponent(source)}`}
        className="btn-accent shrink-0 whitespace-nowrap text-sm"
      >
        {cta}
      </Link>
    </aside>
  );
}
