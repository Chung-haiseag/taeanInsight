// 2026-10 리디자인 공용 조각 — 홈·지금 태안·해변·지역경제·인물·뉴스아카이브가 같이 쓴다.
//   원칙(가독성 우선): 글자는 0.85rem 아래로 내리지 않는다 · 숫자는 크게, 단위는 옆에 · 상태는 '좋음/주의' 같은 쉬운 말 알약
//   · 표 대신 카드(표가 꼭 필요하면 caption·scope) · 이모지 장식 없이 제목으로 말한다. ti-* 토큰은 고대비에서 바뀐다.

import Link from "next/link";

// ── 공통 ──

export type Tone = "good" | "ok" | "warn" | "bad" | "plain";

/** 등급 알약 — 밝은 바탕 + 짙은 글자라 고대비 모드에서도 AA. 색만이 아니라 글자로 상태를 말한다. */
const TONE_CLS: Record<Tone, string> = {
  good: "bg-[#DCEBFF] text-[#0B3D91]",
  ok: "bg-[#CFEEDC] text-[#0F4D2E]",
  warn: "bg-[#FCE3B5] text-[#6B3F00]",
  bad: "bg-[#FAD4D1] text-[#8A1C14]",
  plain: "bg-ti-sunk text-ti-ink",
};
export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.85rem] font-bold ${TONE_CLS[tone]}`}>{children}</span>;
}

/** 미세먼지 등급 말 → 알약 색 */
export function airTone(grade: string | null | undefined): Tone {
  if (!grade) return "plain";
  if (grade.includes("매우")) return "bad";
  if (grade.includes("나쁨")) return "warn";
  if (grade.includes("보통")) return "ok";
  if (grade.includes("좋음")) return "good";
  return "plain";
}
// 등급 기준은 순수 규칙이라 lib/air-grade.ts 에 둔다(테스트에서 값으로 가져오기 위함). 여기서는 다시 내보내기만.
export { pmGrade } from "@/lib/air-grade";

export function SecHead({ id, title, note, link }: { id: string; title: string; note?: string; link?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-t-2 border-ti-ink pt-3.5">
      <div>
        <h2 id={id} className="font-head text-[clamp(1.4rem,2.6vw,1.85rem)] font-black tracking-[-0.02em] text-ti-ink">{title}</h2>
        {note && <p className="mt-1 text-ti-ink2">{note}</p>}
      </div>
      {link && <Link href={link.href} className="text-[0.95rem] font-bold text-ti-petrol-ink underline underline-offset-4">{link.label}</Link>}
    </div>
  );
}

export const Card = ({ className = "", children, labelledBy }: { className?: string; children: React.ReactNode; labelledBy?: string }) => (
  <section aria-labelledby={labelledBy} className={`min-w-0 rounded-[18px] border border-ti-line bg-ti-surface p-5 ${className}`}>{children}</section>
);
export const CardTitle = ({ id, children, aside }: { id?: string; children: React.ReactNode; aside?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-2">
    <h3 id={id} className="text-[1.08rem] font-bold text-ti-ink">{children}</h3>
    {aside}
  </div>
);
export const Source = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-[0.85rem] text-ti-muted">{children}</p>;

