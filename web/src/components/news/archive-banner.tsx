// 뉴스아카이브 머리칸 — '88,904건'이라는 숫자를 **37년의 두께**로 보여준다.
//   숫자만 적으면 크기가 안 와닿는다. 연도별 막대가 창간(1990)부터 지금까지 쌓인 모양을 보여 주고,
//   아카이브를 보는 세 가지 길(기사 검색 · 옛 광고 · 옛날 물가)을 같은 칸에 묶는다.
// ⚠ 지어내지 않는다 — 연도 집계를 못 받으면 막대 칸을 통째로 지우고 글만 남긴다.
// ⚠ 색만으로 말하지 않는다 — 가장 많은 해는 막대 색을 바꾸되 설명에도 글로 적는다.
// ⚠ 색은 전부 ti-* 토큰(고대비 모드에 대응). 어두운 칸 위의 옅은 색만 on-dark 관례대로 흰색 투명도.

import Link from "next/link";

import { summarizeYears, barHeights, decadeTicks, type YearCount } from "@/lib/archive-years";

const BAR = 7;
const GAP = 3;
const PLOT_H = 76;
const AXIS_H = 15;
const PAD_X = 14;   // 양끝 연도 글자가 막대 밖으로 나가므로 viewBox 를 그만큼 넓힌다

/** 아카이브를 보는 세 가지 길. current 는 지금 보고 있는 화면. */
const WAYS = [
  { href: "/news", label: "기사 검색", note: "제목·본문에서 찾기" },
  { href: "/paper/ads", label: "옛 광고", note: "그 시절 집값·품삯" },
  { href: "/paper/prices", label: "옛날 물가", note: "광고로 만든 30년 시세표" },
] as const;

function YearChart({ years }: { years: YearCount[] }) {
  const s = summarizeYears(years);
  if (!s || !s.peak) return null;
  const hs = barHeights(years, PLOT_H, 2);
  const w = years.length * (BAR + GAP) - GAP;
  const ticks = decadeTicks(years);
  const desc = `${s.from}년부터 ${s.to}년까지 해마다 디지털로 옮긴 기사 수. 가장 많은 해는 ${s.peak.year}년 ${s.peak.n.toLocaleString()}건입니다.`;

  return (
    <figure className="m-0">
      <svg viewBox={`${-PAD_X} 0 ${w + PAD_X * 2} ${PLOT_H + AXIS_H}`} role="img" aria-labelledby="yc-t yc-d" className="block h-auto w-full">
        <title id="yc-t">연도별 기사 수</title>
        <desc id="yc-d">{desc}</desc>
        {years.map((y, i) => (
          <rect
            key={y.year}
            x={i * (BAR + GAP)}
            y={PLOT_H - hs[i]}
            width={BAR}
            height={hs[i]}
            rx={1.5}
            fill={y.year === s.peak!.year ? "#FFD27A" : "#7FD3DB"}
            opacity={y.n === 0 ? 0 : 1}
          />
        ))}
        <line x1="0" y1={PLOT_H + 0.5} x2={w} y2={PLOT_H + 0.5} stroke="rgba(255,255,255,.18)" strokeWidth="1" />
        <g fill="var(--ti-on-navy-muted)" fontSize="8.5">
          {ticks.map((t) => (
            <text key={t} x={(t - s.from) * (BAR + GAP) + BAR / 2} y={PLOT_H + 11} textAnchor="middle">{t}</text>
          ))}
        </g>
      </svg>
      <figcaption className="mt-2 break-keep text-[0.9rem] text-ti-on-navy-muted">
        해마다 옮긴 기사 수 · 가장 많은 해는{" "}
        <b className="font-bold text-ti-on-navy">{s.peak.year}년 {s.peak.n.toLocaleString()}건</b>
      </figcaption>
    </figure>
  );
}

export function ArchiveBanner({ total, minYear, maxYear, years, current }: {
  total: number;
  minYear: number | null;
  maxYear: number | null;
  years: YearCount[];
  current: string;
}) {
  const s = summarizeYears(years);
  // 햇수는 양끝을 포함해 센다(1990~2026 = 37년). 연도 집계가 없으면 min/max 로 센다.
  const from = s?.from ?? minYear;
  const to = s?.to ?? maxYear;
  const span = from != null && to != null && to >= from ? to - from + 1 : null;

  return (
    <section aria-labelledby="archive-title" className="on-dark overflow-hidden rounded-[22px] bg-ti-navy text-ti-on-navy">
      <div className="grid gap-7 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:gap-10">
        <div>
          <p className="text-[0.85rem] font-bold tracking-[0.14em] text-ti-on-navy-muted">뉴스아카이브</p>
          <h1 id="archive-title" className="mt-2 font-head text-[clamp(1.9rem,4vw,2.8rem)] font-black leading-[1.15] tracking-[-0.025em]">
            {total > 0 ? (
              <><span className="font-display tabular-nums">{total.toLocaleString()}</span>건의 태안</>
            ) : "뉴스아카이브"}
          </h1>
          <p className="mt-3 max-w-[32em] break-keep text-[1.05rem] leading-relaxed text-ti-on-navy-muted">
            {from != null && to != null
              ? <>{from}년 창간호부터 {to}년까지{span ? `, ${span}년 치` : ""} 기사를 한 장씩 디지털로 옮겼습니다.</>
              : "태안신문 지면을 한 장씩 디지털로 옮겼습니다."}
          </p>
        </div>

        {years.length > 0 && <YearChart years={years} />}
      </div>

      {/* 아카이브를 보는 세 가지 길 — 머리칸과 한 몸으로 묶는다. 떨어뜨려 두면 카드 세 장이
          허공에 뜬 것처럼 보인다(2026-10-13 사용자 지적). */}
      <nav aria-label="아카이브 보는 방식" className="border-t border-white/15 px-6 pb-6 pt-5 md:px-8 md:pb-7">
        <ul className="m-0 grid list-none gap-2.5 p-0 md:grid-cols-3">
          {WAYS.map((w) => {
            const here = w.href === current;
            const inner = (
              <>
                <span className="flex items-center gap-2 font-bold">
                  {w.label}
                  {here
                    ? <span className="rounded-full bg-white/20 px-2 py-0.5 text-[0.75rem] font-bold">지금 화면</span>
                    : <span aria-hidden className="ml-auto transition-transform group-hover:translate-x-0.5">→</span>}
                </span>
                <span className="mt-0.5 block break-keep text-[0.9rem] text-ti-on-navy-muted">{w.note}</span>
              </>
            );
            return (
              <li key={w.href}>
                {here ? (
                  <span aria-current="page" className="block min-h-11 rounded-xl bg-white/[0.16] px-4 py-2.5">{inner}</span>
                ) : (
                  <Link href={w.href} className="group block min-h-11 rounded-xl bg-white/[0.06] px-4 py-2.5 transition-colors hover:bg-white/[0.14]">
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </section>
  );
}
