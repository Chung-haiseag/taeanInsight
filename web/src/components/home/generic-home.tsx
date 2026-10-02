"use client";

// 일반(비개인화) 홈 — 비로그인 방문자의 첫 화면. 2026-10 '신문 1면' 리디자인(design/home-redesign.html 시안).
//   흐름: 1면(머리기사·오늘의 브리핑 | 오늘의 바다) → 이번 주 태안(기사 4 + 더 보기 4) → 숫자로 보는 태안
//         → 멤버 전용 인사이트(주말 수요 예측 맛보기) → 태안의 기억과 사람(아카이브·인물) → 멤버십.
//   방침: 시안의 예시 수치 대신 **실데이터**만 쓴다. 값이 없으면 그 칸을 지운다(지어낸 숫자를 보이지 않는다).
//         유일한 정적 내용은 멤버십 요금 카드(PLANS) — 아래 주석 참고.

import { useEffect, useState } from "react";
import Link from "next/link";

import { BriefingCard } from "@/components/home/briefing-card";
import { SeaPanel } from "@/components/home/sea-panel";
import { getArchiveStats, type ArchiveStats } from "@/lib/api/archive";
import { getFeaturedPersons, getKgStatus } from "@/lib/api/kg-public";
import type { PersonSearchResult } from "@/lib/api/kg";
import { getNews, type NewsItem } from "@/lib/api/news";
import {
  fetchOnThisDay, fetchReportMetrics, getAuctionForecast, getFog, getTodayBrief, getWeekendDemand,
  type AuctionForecastView, type DemandForecast, type FogBoardView, type OnThisDayItem, type ReportMetrics, type TodayBriefView,
} from "@/lib/api/reports";

/** 실패해도 홈 전체가 죽지 않게 — 각 요청은 따로 받고 실패는 null. */
function useLoad<T>(load: () => Promise<T>): { data: T | null; loaded: boolean } {
  const [state, setState] = useState<{ data: T | null; loaded: boolean }>({ data: null, loaded: false });
  useEffect(() => {
    let alive = true;
    load().then((d) => { if (alive) setState({ data: d, loaded: true }); }).catch(() => { if (alive) setState({ data: null, loaded: true }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

async function loadPeople(): Promise<PersonSearchResult[]> {
  const s = await getKgStatus();
  return s.enabled ? (await getFeaturedPersons()).slice(0, 3) : [];
}

const mmdd = (iso?: string) => (iso ? `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일` : "");
const won = (n: number) => Math.round(n).toLocaleString("ko-KR");
/** 18400(만원) → "1억 8,400" */
function eok(manwon: number): string {
  const e = Math.floor(manwon / 10000);
  const rest = Math.round(manwon % 10000);
  if (!e) return won(rest);
  return rest ? `${e}억 ${won(rest)}` : `${e}억`;
}

export function GenericHome() {
  const news = useLoad(() => getNews(undefined, 9));
  const brief = useLoad<TodayBriefView | null>(getTodayBrief);
  const metrics = useLoad<ReportMetrics | null>(fetchReportMetrics);
  const fog = useLoad<FogBoardView | null>(getFog);
  const demand = useLoad<DemandForecast | null>(getWeekendDemand);
  const auction = useLoad<AuctionForecastView | null>(getAuctionForecast);
  const stats = useLoad<ArchiveStats>(getArchiveStats);
  const onThisDay = useLoad<OnThisDayItem[]>(() => fetchOnThisDay(1));
  const people = useLoad(loadPeople);

  const items = news.data?.items ?? [];
  const labels = news.data?.labels ?? {};
  const lead = items[0] ?? null;
  const grid = items.slice(1, 5);
  const more = items.slice(5, 9);

  return (
    <div className="space-y-12 text-ti-ink">
      {/* ── 1면 ── */}
      <div className="grid gap-9 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <article aria-labelledby="lead-title">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.9rem] text-ti-muted">
            <span className="font-serif text-base font-bold text-ti-ink">오늘의 태안</span>
            <span>태안신문 최신 기사</span>
          </div>
          {lead?.leadImage && (
            <figure className="mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- 아카이브 원본 사진(외부 호스트), 크기 미상 */}
              <img src={lead.leadImage} alt="" className="aspect-video h-auto w-full rounded-2xl bg-ti-sunk object-cover" decoding="async" />
            </figure>
          )}
          {lead && <p className="text-[0.78rem] font-bold tracking-[0.14em] text-ti-petrol-ink">{labels[lead.category] ?? lead.category}</p>}
          <h1 id="lead-title" className="mt-2.5 font-serif text-[clamp(1.9rem,4.2vw,3.1rem)] font-black leading-[1.22] tracking-[-0.025em]">
            {lead ? (
              <Link href={`/news/${lead.id}`} className="hover:underline hover:decoration-2 hover:underline-offset-[6px]">{lead.title}</Link>
            ) : news.loaded ? (
              "태안신문이 만드는 AI 지역 리포트"
            ) : (
              <span className="text-ti-muted">오늘의 태안 소식을 불러오는 중입니다</span>
            )}
          </h1>
          {lead?.excerpt && <p className="mt-4 line-clamp-4 max-w-[40em] text-[1.12rem] text-ti-ink2">{lead.excerpt}</p>}
          {lead && (
            <p className="mt-3.5 text-[0.85rem] text-ti-muted">
              {[lead.author, lead.publishedAt?.slice(0, 10).replace(/-/g, "."), "태안신문"].filter(Boolean).join(" · ")}
            </p>
          )}
          {news.loaded && !lead && (
            <p className="mt-4 text-ti-ink2">
              최신 기사를 지금 불러오지 못했습니다. <Link href="/news" className="font-semibold text-ti-petrol-ink underline underline-offset-4">뉴스아카이브</Link>에서 바로 찾아보세요.
            </p>
          )}
          {brief.data && <BriefingCard brief={brief.data} />}
        </article>

        <SeaPanel metrics={metrics.data} fog={fog.data} loaded={metrics.loaded} />
      </div>

      {/* ── 이번 주 태안 ── */}
      {grid.length > 0 && (
        <section aria-labelledby="news-title">
          <SecHead id="news-title" title="이번 주 태안" link={{ href: "/news", label: "뉴스아카이브 전체 보기" }} />
          <ul className="m-0 grid list-none gap-x-7 gap-y-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {grid.map((it) => (
              <li key={it.id} className="group flex min-w-0 flex-col gap-2">
                <div className="aspect-[4/3] overflow-hidden rounded-xl bg-ti-sunk">
                  {it.leadImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 아카이브 원본 사진(외부 호스트)
                    <img src={it.leadImage} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.03]" />
                  ) : (
                    <Waves />
                  )}
                </div>
                <p className="text-[0.78rem] font-bold text-ti-petrol-ink">{labels[it.category] ?? it.category}</p>
                <h3 className="font-serif text-[1.12rem] font-bold leading-snug">
                  <Link href={`/news/${it.id}`} className="hover:underline hover:underline-offset-4">{it.title}</Link>
                </h3>
                {it.excerpt && <p className="line-clamp-3 text-[0.92rem] text-ti-ink2">{it.excerpt}</p>}
                {it.publishedAt && <time dateTime={it.publishedAt.slice(0, 10)} className="text-[0.8rem] text-ti-muted">{mmdd(it.publishedAt)}</time>}
              </li>
            ))}
          </ul>
          {more.length > 0 && (
            <ul aria-label="더 많은 기사" className="mt-7 grid list-none gap-x-8 gap-y-2.5 border-t border-ti-line p-0 pt-4 sm:grid-cols-2">
              {more.map((it) => (
                <li key={it.id}>
                  <Link href={`/news/${it.id}`} className="relative block pl-3.5 font-semibold text-ti-ink2 before:absolute before:left-0 before:top-[0.7em] before:h-[5px] before:w-[5px] before:rounded-full before:bg-ti-petrol hover:text-ti-ink hover:underline hover:underline-offset-4">
                    {it.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Metrics metrics={metrics.data} auction={auction.data} demand={demand.data} />

      <InsightTeaser demand={demand.data} loaded={demand.loaded} beaches={metrics.data?.tourism.marine?.beaches.map((b) => b.name) ?? []} />

      <MemoryAndPeople stats={stats.data} onThisDay={onThisDay.data?.[0] ?? null} people={people.data ?? []} />

      <Membership />
    </div>
  );
}

function SecHead({ id, title, link, eyebrow, note, dark = false }: {
  id: string; title: string; link?: { href: string; label: string }; eyebrow?: string; note?: string; dark?: boolean;
}) {
  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-3 border-t-2 pt-3.5 ${dark ? "border-ti-on-navy" : "border-ti-ink"}`}>
      <div>
        {eyebrow && <p className={`text-[0.78rem] font-bold tracking-[0.14em] ${dark ? "text-[#F0CB82]" : "text-ti-petrol-ink"}`}>{eyebrow}</p>}
        <h2 id={id} className="font-serif text-[clamp(1.4rem,2.6vw,1.85rem)] font-black tracking-[-0.02em]">{title}</h2>
      </div>
      {note && <p className={`max-w-[34em] ${dark ? "text-ti-on-navy-muted" : "text-ti-ink2"}`}>{note}</p>}
      {link && (
        <Link href={link.href} className="text-[0.9rem] font-bold text-ti-petrol-ink underline underline-offset-4">{link.label}</Link>
      )}
    </div>
  );
}

/** 사진 없는 기사 자리 — 잔물결 무늬(장식) */
function Waves() {
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
      {[40, 60, 80].map((y) => (
        <path key={y} d={`M0 ${y} C20 ${y - 8},40 ${y - 8},60 ${y} S100 ${y + 8},120 ${y} S150 ${y - 6},160 ${y}`} fill="none" stroke="var(--ti-line)" strokeWidth="2" />
      ))}
    </svg>
  );
}

// ── 숫자로 보는 태안 — 위판 시세·아파트 실거래·유가·주말 관광 수요(있는 것만) ──
function Metrics({ metrics, auction, demand }: { metrics: ReportMetrics | null; auction: AuctionForecastView | null; demand: DemandForecast | null }) {
  const cards: Array<{ label: string; big: string; unit: string; delta?: string }> = [];
  const fish = auction?.available ? auction.items.find((i) => i.avgPricePerKg > 0) : undefined;
  if (fish) {
    cards.push({
      label: `태안 위판장 ${fish.fish}`,
      big: won(fish.avgPricePerKg),
      unit: "원/kg",
      delta: fish.pricePct != null && Math.abs(fish.pricePct) >= 0.1
        ? `${fish.pricePct < 0 ? "▼" : "▲"} 지난 경매보다 ${Math.abs(fish.pricePct).toFixed(1)}% ${fish.pricePct < 0 ? "내림" : "오름"}`
        : "지난 경매와 비슷",
    });
  }
  const apt = metrics?.realestate.apt;
  if (apt && apt.count > 0 && apt.avgManwon > 0) {
    cards.push({ label: "태안 아파트 평균 거래가", big: eok(apt.avgManwon), unit: "만원", delta: `최근 실거래 ${apt.count}건 기준` });
  }
  const gas = metrics?.oil?.gasoline;
  if (gas && gas.chungnam > 0) {
    cards.push({
      label: "충남 휘발유 평균가",
      big: won(gas.chungnam),
      unit: "원/L",
      delta: gas.diffDay ? `${gas.diffDay < 0 ? "▼" : "▲"} 어제보다 ${won(Math.abs(gas.diffDay))}원 ${gas.diffDay < 0 ? "내림" : "오름"}` : "어제와 같음",
    });
  }
  if (demand) {
    cards.push({ label: "이번 주말 관광 수요", big: String(demand.index), unit: "/ 100", delta: `수요 ${demand.level}` });
  }
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="eco-title">
      <SecHead id="eco-title" title="숫자로 보는 태안" link={{ href: "/data", label: "지역경제 데이터 보기" }} />
      {/* 칸 사이 1px 선 = 바탕(ti-line)이 gap 으로 비쳐 보이는 것 */}
      <dl className={`m-0 grid gap-px overflow-hidden rounded-[14px] border border-ti-line bg-ti-line sm:grid-cols-2 ${cards.length >= 4 ? "lg:grid-cols-4" : cards.length === 3 ? "lg:grid-cols-3" : ""}`}>
        {cards.map((c) => (
          <div key={c.label} className="min-w-0 bg-ti-surface px-5 py-4">
            <dt className="text-[0.85rem] font-semibold text-ti-muted">{c.label}</dt>
            <dd className="m-0 mt-1.5">
              <span className="font-display text-[1.85rem] font-semibold tabular-nums tracking-[-0.01em]">{c.big}</span>
              <span className="ml-1 text-[0.85rem] text-ti-muted">{c.unit}</span>
              {c.delta && <span className="mt-0.5 block text-[0.82rem] font-bold text-ti-ink2">{c.delta}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── 멤버 전용 인사이트 — 주말 수요 예측 맛보기. 전체 지수는 공개, 해변·업종별 상세는 잠금. ──
const LOCK_FALLBACK = ["꽃지", "만리포", "신두리"];
const LOCK_WIDTHS = ["70%", "55%", "38%"];

function InsightTeaser({ demand, loaded, beaches }: { demand: DemandForecast | null; loaded: boolean; beaches: string[] }) {
  if (loaded && !demand) return null;
  const locked = (beaches.length >= 3 ? beaches : LOCK_FALLBACK).slice(0, 3);
  const range = demand ? `${mmdd(demand.weekend.sat)}~${Number(demand.weekend.sun.slice(8, 10))}일` : "";
  return (
    <section aria-labelledby="ins-title" className="rounded-[24px] bg-ti-sunk px-5 py-9 md:px-8">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <p className="text-[0.78rem] font-bold tracking-[0.14em] text-ti-petrol-ink">멤버 전용 인사이트</p>
          <h2 id="ins-title" className="mt-2 font-serif text-[clamp(1.5rem,3vw,2.1rem)] font-black leading-[1.3] tracking-[-0.02em]">
            이번 주말 태안, 얼마나 붐빌까요?
          </h2>
          <p className="mt-3.5 text-ti-ink2">
            날씨, 물때, 축제 일정, 연휴와 계절을 함께 읽어 주말 방문을 예측합니다. 펜션·식당·낚시점 사장님은 준비할 물량과 인력을 미리 정할 수 있습니다.
          </p>
          <ul className="mt-4 grid list-disc gap-1.5 pl-5 text-ti-ink2">
            <li>업종별 주말 수요 예측과 근거</li>
            <li>업종별 준비 체크리스트</li>
            <li>주간 인사이트 리포트 전문</li>
          </ul>
        </div>
        <div className="rounded-[20px] border border-ti-line bg-ti-surface p-5 md:p-6">
          {!demand ? (
            <div className="h-48 animate-pulse rounded-xl bg-ti-sunk" aria-hidden="true" />
          ) : (
            <>
              <h3 className="text-base font-bold">{range} 주말 관광 수요 예측</h3>
              <p className="mt-1 text-[0.92rem] text-ti-ink2">{demand.headline}</p>
              <table className="mt-3.5 w-full border-collapse text-[0.92rem]">
                <caption className="pb-1.5 text-left text-[0.82rem] text-ti-muted">수요 지수(0~100) — 날씨·물때·축제·연휴·계절 종합</caption>
                <thead>
                  <tr className="text-[0.78rem] text-ti-muted">
                    <th scope="col" className="border-b border-ti-line px-1.5 py-2 text-left font-semibold">지역</th>
                    <th scope="col" className="border-b border-ti-line px-1.5 py-2 text-left font-semibold">지수</th>
                    <th scope="col" className="w-[44%] border-b border-ti-line px-1.5 py-2 text-left font-semibold">수요</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className="border-b border-ti-line px-1.5 py-2.5 text-left">태안 전체</th>
                    <td className="border-b border-ti-line px-1.5 py-2.5 font-display tabular-nums">{demand.index}</td>
                    <td className="border-b border-ti-line px-1.5 py-2.5">
                      <div className="h-2.5 overflow-hidden rounded-full bg-ti-sunk" aria-hidden="true">
                        <i className="block h-full rounded-full bg-ti-petrol" style={{ width: `${Math.max(4, Math.min(100, demand.index))}%` }} />
                      </div>
                      <span className="text-[0.8rem] text-ti-muted">{demand.level}</span>
                    </td>
                  </tr>
                  {/* 잠긴 줄 — 모양만 보여 주는 장식. 값은 없다(스크린리더에는 아래 문장으로 알린다). */}
                  {locked.map((name, i) => (
                    <tr key={name} aria-hidden="true" className="select-none">
                      <th scope="row" className="border-b border-ti-line px-1.5 py-2.5 text-left font-semibold">{name}</th>
                      <td className="border-b border-ti-line px-1.5 py-2.5 text-transparent [text-shadow:0_0_9px_var(--ti-muted)]">00</td>
                      <td className="border-b border-ti-line px-1.5 py-2.5">
                        <div className="h-2.5 overflow-hidden rounded-full bg-ti-sunk">
                          <i className="block h-full rounded-full bg-ti-line" style={{ width: LOCK_WIDTHS[i] }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="sr-only">해변별·업종별 상세 예측은 멤버에게만 공개됩니다.</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ti-gold-soft px-4 py-3">
                <p className="text-[0.9rem] font-semibold text-ti-gold-ink">업종별 상세 예측은 멤버에게 공개됩니다.</p>
                <Link href="/membership?utm_source=demand" className="inline-flex min-h-11 items-center justify-center rounded-full bg-ti-navy px-5 font-bold text-ti-on-navy transition-colors hover:bg-ti-petrol">
                  멤버십으로 전체 보기
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ── 태안의 기억과 사람 — 아카이브(연도·N년 전 오늘) + 인물(공개 시) ──
function MemoryAndPeople({ stats, onThisDay, people }: { stats: ArchiveStats | null; onThisDay: OnThisDayItem | null; people: PersonSearchResult[] }) {
  const minY = stats?.minYear ?? null;
  const maxY = stats?.maxYear ?? null;
  const span = minY && maxY ? maxY - minY + 1 : null;
  // 연도 바로가기 — 첫해, 10년 단위, 올해
  const years: number[] = [];
  if (minY && maxY) {
    years.push(minY);
    for (let y = Math.ceil((minY + 1) / 10) * 10; y < maxY; y += 10) years.push(y);
    if (maxY !== minY) years.push(maxY);
  }
  return (
    <section aria-labelledby="arc-title">
      <SecHead id="arc-title" title="태안의 기억과 사람" />
      <div className={`grid gap-7 ${people.length ? "md:grid-cols-2" : ""}`}>
        <article aria-labelledby="arc-h" className="flex min-w-0 flex-col gap-3.5 rounded-[20px] border border-ti-line bg-ti-surface p-6">
          <p className="text-[0.78rem] font-bold tracking-[0.14em] text-ti-petrol-ink">뉴스아카이브{minY ? ` · ${minY}년부터` : ""}</p>
          <h3 id="arc-h" className="font-serif text-[1.3rem] font-bold">
            {span ? `${span}년 치 태안신문을 검색하고 지면 그대로 봅니다` : "태안신문 옛 기사를 검색하고 지면 그대로 봅니다"}
          </h3>
          <p className="text-[0.95rem] text-ti-ink2">
            종이 신문을 한 장씩 디지털로 옮겼습니다{stats?.total ? `(기사 ${won(stats.total)}건)` : ""}. 기사 검색은 물론 당시 지면 이미지와 낭독 듣기까지 함께 제공합니다.
          </p>
          <div className="border-l-[3px] border-ti-gold py-0.5 pl-3.5">
            {onThisDay ? (
              <>
                <Link href={`/news/${onThisDay.idxno}`} className="font-serif text-[1.02rem] font-bold hover:underline hover:underline-offset-4">
                  “{onThisDay.title}”
                </Link>
                <p className="mt-1 text-[0.8rem] text-ti-muted">{onThisDay.yearsAgo}년 전 오늘({onThisDay.year}년) 태안신문</p>
              </>
            ) : (
              <>
                <p className="font-serif text-[1.02rem] font-bold">“그해 오늘, 태안에는 어떤 소식이 있었을까요?”</p>
                <p className="mt-1 text-[0.8rem] text-ti-muted">같은 날짜의 옛 기사를 아카이브에서 찾아보세요</p>
              </>
            )}
          </div>
          {years.length > 0 && (
            <ul aria-label="연도별 아카이브" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {years.map((y) => (
                <li key={y}>
                  <Link href={`/news?year=${y}`} className="block rounded-lg border border-ti-line px-2.5 py-1 font-display text-[0.9rem] font-semibold tabular-nums hover:border-ti-petrol hover:text-ti-petrol-ink">
                    {y}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
        {people.length > 0 && (
          <article aria-labelledby="ppl-h" className="flex min-w-0 flex-col gap-3.5 rounded-[20px] border border-ti-line bg-ti-surface p-6">
            <p className="text-[0.78rem] font-bold tracking-[0.14em] text-ti-petrol-ink">인물 · 관계 지도</p>
            <h3 id="ppl-h" className="font-serif text-[1.3rem] font-bold">누가 태안을 움직이는지 기사 속 관계로 봅니다</h3>
            <p className="text-[0.95rem] text-ti-ink2">기사에 함께 등장한 사람과 조직, 맡았던 일을 기사 근거와 함께 연결했습니다.</p>
            <ul aria-label="자주 등장한 인물" className="m-0 flex list-none flex-wrap gap-2 p-0">
              {people.map((p) => (
                <li key={p.id}>
                  <Link href={`/people/${encodeURIComponent(p.id)}`} className="flex items-center gap-2 rounded-full border border-ti-line py-1 pl-1 pr-3 text-[0.9rem] hover:border-ti-petrol">
                    <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-ti-petrol-soft text-[0.8rem] font-bold text-ti-petrol-ink">{p.name.slice(0, 1)}</span>
                    {p.name}
                    {p.qualifier && <small className="text-ti-muted">{p.qualifier}</small>}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/people" className="mt-auto text-[0.9rem] font-bold text-ti-petrol-ink underline underline-offset-4">인물 더 찾아보기</Link>
          </article>
        )}
      </div>
    </section>
  );
}

// ── 멤버십 — 2026-10 시안의 네 요금 카드 그대로.
//   ⚠ 지금 /membership 은 월 9,900원 한 상품만 판다(2026-08-25 개편). '인사이트 독자 3,000원'·'효도 구독'·'기관'은
//     아직 결제 길이 없으니, 배포 전에 요금·혜택 문구를 /membership 과 맞추거나 그쪽 상품을 먼저 연다. ──
const PLANS: Array<{ name: string; tag: string; price: string; unit?: string; perks: string[]; cta: string; best?: boolean }> = [
  { name: "인사이트 독자", tag: "태안 소식을 깊이 읽고 싶은 분", price: "3,000", unit: "원 / 월", perks: ["모든 기사와 브리핑", "아카이브 전체 검색", "광고 없는 화면"], cta: "독자로 시작" },
  { name: "비즈니스", tag: "펜션·식당·낚시점·카페 사장님", price: "9,900", unit: "원 / 월", perks: ["주말 수요 예측", "위판 시세와 사입 시점 알림", "업종별 준비 체크리스트", "독자 혜택 모두 포함"], cta: "비즈니스 시작", best: true },
  { name: "효도 구독", tag: "자녀가 결제하고 부모님이 읽기", price: "9,900", unit: "원 / 월", perks: ["큰 글씨와 낭독 듣기", "부모님 계정 따로 만들기", "명절·생신 선물하기"], cta: "선물하기" },
  { name: "기관", tag: "군청·협회·공공기관", price: "연간 계약", perks: ["부서 단위 계정", "정책 모니터링 리포트", "데이터 내려받기"], cta: "도입 문의" },
];

function Membership() {
  return (
    <section aria-labelledby="mem-title" className="on-dark rounded-[24px] bg-ti-navy px-5 py-10 text-ti-on-navy md:px-8">
      <SecHead
        id="mem-title"
        dark
        eyebrow="태안 인사이트 멤버십"
        title="태안을 먼저 읽는 사람들"
        note="커피 한 잔 값으로 매일의 브리핑, 주말 예측, 아카이브를 모두 엽니다. 언제든 해지할 수 있습니다."
      />
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => (
          <li
            key={p.name}
            className={`flex min-w-0 flex-col gap-3 rounded-[18px] border p-5 ${p.best ? "on-light border-ti-gold bg-ti-surface text-ti-ink shadow-[0_0_0_2px_var(--ti-gold)]" : "border-white/15 bg-white/5"}`}
          >
            {p.best && <span className="self-start rounded-full bg-ti-gold px-2.5 py-0.5 text-[0.72rem] font-bold text-ti-on-gold">사장님 추천</span>}
            <h3 className="text-[1.05rem] font-bold">{p.name}</h3>
            <p className={`text-[0.85rem] ${p.best ? "text-ti-muted" : "text-ti-on-navy-muted"}`}>{p.tag}</p>
            <p className={`font-display font-semibold tabular-nums ${p.unit ? "text-[1.9rem]" : "text-[1.5rem]"}`}>
              {p.price}
              {p.unit && <small className="ml-1 font-sans text-[0.85rem] font-medium">{p.unit}</small>}
            </p>
            <ul className="m-0 grid flex-1 list-disc gap-1 pl-5 text-[0.9rem]">
              {p.perks.map((k) => <li key={k}>{k}</li>)}
            </ul>
            <Link
              href="/membership"
              className={`inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 font-bold transition-colors ${p.best ? "bg-ti-gold text-ti-on-gold hover:opacity-90" : "border-[1.5px] border-white/50 text-ti-on-navy hover:bg-ti-on-navy hover:text-ti-navy"}`}
            >
              {p.cta}
              <span className="sr-only"> — {p.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[0.88rem] text-ti-on-navy-muted">
        <span>태안신문이 만듭니다</span>
        <span>모든 발행물은 편집부가 검토합니다</span>
        <span>스크린리더·큰 글씨·낭독 지원</span>
      </div>
    </section>
  );
}
