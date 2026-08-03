"use client";

// 일반(비개인화) 홈 — 비로그인 방문자의 첫 화면. 방문자 첫인상 강화판.
//   흐름: 히어로(정체성·실수치 증거·CTA) → 실시간 '지금 태안' → 대표 콘텐츠 쇼케이스(질의·아카이브·옛신문·인물)
//         → 실제 최신 기사 → 지역 저널리즘·신뢰.
//   방침: 기술("AI")이 아니라 가치를 말한다. 숫자는 실데이터(archive/stats)로만, 배지 남발 금지.

import { useEffect, useState } from "react";
import Link from "next/link";

import { Icon, type IconName } from "@/components/icon";
import { PersonalizedNewsStrip } from "@/components/home/personalized-news";
import { LiveSummaryStrip } from "@/components/home/live-summary";
import { getArchiveStats, type ArchiveStats } from "@/lib/api/archive";
import { getWeekendDemand, type DemandForecast } from "@/lib/api/reports";

export function GenericHome() {
  const [stats, setStats] = useState<ArchiveStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    getArchiveStats().then((s) => { if (!cancelled) setStats(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const total = stats?.total && stats.total > 0 ? stats.total : null;
  const minY = stats?.minYear ?? null;
  const maxY = stats?.maxYear ?? null;
  const span = minY && maxY ? maxY - minY : null;
  const totalKo = total ? formatManBun(total) : null; // "10만 4,024" 형태

  return (
    <div className="space-y-14">
      {/* Hero — 좌측 정렬 에디토리얼 */}
      <section className="pt-4 md:pt-6">
        <p className="eyebrow">
          <span className="inline-block h-px w-6 bg-accent" aria-hidden="true" />
          태안 인사이트 · 지역 저널리즘
        </p>
        <h1 className="mt-3 font-sans text-3xl font-bold leading-[1.15] text-brand sm:text-4xl md:text-5xl">
          태안의 어제와 오늘을, 한곳에서.
        </h1>
        <span className="accent-rule mt-4" aria-hidden="true" />
        <p className="mt-4 max-w-prose leading-relaxed text-foreground-muted">
          {total ? <><strong className="font-semibold text-brand">{totalKo}건</strong>의 지역 기록과 실시간 현황을 한 번에. </> : "지역 기록과 실시간 현황을 한 번에. "}
          자연어로 묻고, 근거와 함께 답을 받으세요. 모든 콘텐츠는 편집부 검토를 거쳐 발행됩니다.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/query" className="btn-accent">무엇이든 질문</Link>
          <Link href="/news" className="btn-ghost">뉴스 아카이브</Link>
          <Link href="/reports" className="btn-ghost">주간 리포트</Link>
        </div>
        {(total || span) && (
          <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-4 border-t border-brand/10 pt-5">
            {total && <HeroStat value={totalKo!} unit="건" label="지역 기사 아카이브" />}
            {minY && maxY && <HeroStat value={`${minY}–${String(maxY).slice(2)}`} unit="" label={span ? `${span}년치 기록` : "수록 기간"} />}
            <HeroStat value="100" unit="%" label="편집부 검토 발행" />
          </dl>
        )}
      </section>

      {/* 예측 인사이트 — 이번 주말 관광 지수(대표 예측·미끼) */}
      <WeekendDemandCard />

      {/* 지금 태안 — 라이브 핵심 지표(실데이터) */}
      <LiveSummaryStrip />

      {/* 대표 콘텐츠 쇼케이스 — 이 사이트에서 할 수 있는 것 */}
      <section aria-labelledby="showcase-heading">
        <div className="hairline pt-8">
          <p className="eyebrow">둘러보기</p>
          <h2 id="showcase-heading" className="mt-2 text-2xl font-bold text-brand md:text-3xl">
            태안을 읽는 네 가지 길
          </h2>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <FeatureCard
            href="/query" icon="chat"
            kicker="질의응답"
            title="무엇이든 물어보세요"
            desc="자연어로 묻고, 근거 기사와 실시간 데이터를 함께 답으로 받습니다."
            stat="출처 표기" statLabel="모든 답변에 근거"
          />
          <FeatureCard
            href="/news" icon="books"
            kicker="뉴스 아카이브"
            title={total ? `${totalKo}건의 태안 기록` : "태안 기사 아카이브"}
            desc="1990년부터 오늘까지, 태안신문 전 기사를 한 번에 검색합니다."
            stat={total ? totalKo! : "검색"} statLabel={minY && maxY ? `건 · ${minY}–${maxY}` : "기사 전문"}
          />
          <FeatureCard
            href="/news" icon="book"
            kicker="옛신문 디지털화"
            title="옛 지면까지 되살렸습니다"
            desc="세로쓰기 옛 신문을 복원해 검색 가능한 기사로 담았습니다."
            stat="1990–2001" statLabel="옛 지면 디지털 복원"
          />
          <FeatureCard
            href="/people" icon="link"
            kicker="인물 탐색"
            title="인물과 관계망"
            desc="기사 속 인물이 누구와 함께 등장했는지 관계망으로 탐색합니다."
            stat="관계망" statLabel="함께 등장한 인물"
          />
        </div>
        <p className="mt-4 text-sm text-foreground-muted">
          예측·요약 콘텐츠는 자동 생성 후 <span className="font-semibold text-accent-ink">편집부 검토</span>를 거쳐 발행됩니다.
        </p>
      </section>

      {/* 실제 최신 기사 (관심사 있으면 맞춤, 없으면 최신) */}
      <PersonalizedNewsStrip />

      {/* 지역 저널리즘·신뢰 — 진한 네이비 블록 */}
      <section className="rounded-3xl bg-brand px-6 py-9 text-background md:px-10 md:py-12">
        <p className="eyebrow text-accent-subtle">우리의 약속</p>
        <h2 className="mt-2 text-2xl font-bold md:text-3xl">사람이 검토한 지역 인텔리전스</h2>
        <p className="mt-3 max-w-prose text-background/70">
          기계가 모으고, 편집부가 확인합니다. 예측과 요약은 발행 전 사람의 손을 거치고, AI 답변에는 언제나 출처를 표기합니다.
        </p>
        <div className="mt-7 grid gap-6 md:grid-cols-3">
          <Stat value="100%" label="편집부 검토 후 발행" />
          <Stat value={span ? `${span}년` : "36년"} label={minY && maxY ? `${minY}–${maxY} 기록` : "지역 기록"} />
          <Stat value="시민기자단" label="함께 쓰는 지역 저널리즘" />
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-background/15 pt-5">
          <Link href="/reports" className="text-sm font-semibold text-accent-subtle hover:underline">주간 리포트 →</Link>
          <Link href="/citizen" className="text-sm font-semibold text-accent-subtle hover:underline">시민기자단 →</Link>
          <Link href="/membership" className="text-sm font-semibold text-accent-subtle hover:underline">멤버십 →</Link>
          <span className="ml-auto text-sm text-background/50">2026 지역신문발전위원회 지원 사업</span>
        </div>
      </section>
    </div>
  );
}

// 한국어 만/단위 표기: 104024 → "10만 4,024"
function formatManBun(n: number): string {
  if (n < 10000) return n.toLocaleString();
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  return rest === 0 ? `${man}만` : `${man}만 ${rest.toLocaleString()}`;
}

function HeroStat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-bold tabular-nums text-brand md:text-3xl">
        {value}<span className="ml-0.5 text-base font-semibold text-foreground-muted">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-foreground-muted">{label}</p>
    </div>
  );
}

// 이번 주말 관광 수요 지수 — 규칙기반 예측(날씨·물때·축제·연휴·계절). 방문자용 대표 예측 + 사장님 전환 미끼.
function WeekendDemandCard() {
  const [d, setD] = useState<DemandForecast | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getWeekendDemand().then((r) => { if (alive) setD(r); }).catch(() => { if (alive) setD(null); });
    return () => { alive = false; };
  }, []);
  if (d === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-brand/5" aria-hidden />;
  if (!d) return null; // 예보 데이터 없으면 조용히 숨김
  const high = d.level === "매우높음" || d.level === "높음";
  const low = d.level === "낮음" || d.level === "매우낮음";
  const toneCls = high ? "border-accent/40 bg-accent/5" : low ? "border-blue-200 bg-blue-50/40" : "border-brand/15 bg-background";
  const badgeCls = high ? "bg-accent text-background" : low ? "bg-blue-100 text-blue-700" : "bg-brand/10 text-brand";
  const top = d.factors.filter((f) => Math.abs(f.effect) >= 1).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 3);
  const wx = (w: DemandForecast["weather"]["sat"], day: string) => w
    ? <span>{day} {w.tmax != null ? `${w.tmax}°` : ""}{w.pop != null ? ` · 강수 ${w.pop}%` : ""}</span> : null;
  return (
    <section aria-labelledby="demand-heading" className={`rounded-2xl border p-5 shadow-card ${toneCls}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow"><span className="inline-block h-px w-6 bg-accent" aria-hidden="true" />예측 인사이트 · 이번 주말</p>
          <h2 id="demand-heading" className="mt-2 text-xl font-bold text-brand">이번 주말 태안 관광 수요</h2>
          <p className="text-xs text-foreground-muted">{d.weekend.sat} ~ {d.weekend.sun.slice(5)}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-4xl font-bold leading-none text-brand tabular-nums">{d.index}<span className="text-lg font-medium text-foreground-muted">/100</span></div>
          <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeCls}`}>{d.level}</span>
        </div>
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{d.headline}</p>
      {top.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {top.map((f, i) => (
            <span key={i} className="rounded-full bg-brand/10 px-2 py-0.5 text-brand" title={f.detail}>{f.effect >= 0 ? "+" : ""}{f.effect} {f.label}</span>
          ))}
        </div>
      )}
      {(d.weather.sat || d.weather.sun) && (
        <div className="mt-3 flex gap-5 border-t border-brand/10 pt-3 text-xs text-foreground-muted">
          {wx(d.weather.sat, "토")}{wx(d.weather.sun, "일")}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-brand/5 px-3 py-2">
        <p className="text-xs text-foreground-muted">우리 가게는 이번 주말 어떻게 준비할까요? <strong className="text-brand">업종별 상세 예측·준비 체크리스트</strong></p>
        <Link href="/membership" className="shrink-0 text-xs font-semibold text-accent hover:underline">사장님 멤버십 →</Link>
      </div>
      <p className="mt-2 text-[10px] text-foreground-muted">규칙기반 예측(날씨·물때·축제·연휴·계절). 예측과 실제를 대조해 적중률을 공개합니다.</p>
    </section>
  );
}

function FeatureCard({
  href, icon, kicker, title, desc, stat, statLabel,
}: {
  href: string; icon: IconName; kicker: string; title: string; desc: string; stat: string; statLabel: string;
}) {
  return (
    <Link href={href} className="card card-lift group flex flex-col p-6">
      <div className="flex items-center gap-2 text-accent-ink">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-subtle/40 text-accent-ink">
          <Icon name={icon} size="1.15em" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-kicker">{kicker}</span>
      </div>
      <h3 className="mt-4 font-display text-xl font-bold text-brand group-hover:text-accent-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{desc}</p>
      <div className="mt-5 flex items-baseline gap-2 border-t border-brand/10 pt-4">
        <span className="font-display text-lg font-bold tabular-nums text-brand">{stat}</span>
        <span className="text-xs text-foreground-muted">{statLabel}</span>
        <span className="ml-auto self-center font-semibold text-accent transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
      </div>
    </Link>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t border-background/15 pt-5">
      <p className="font-display text-3xl text-accent-subtle tabular-nums md:text-4xl">{value}</p>
      <p className="mt-2 text-sm uppercase tracking-wide text-background/70">{label}</p>
    </div>
  );
}
