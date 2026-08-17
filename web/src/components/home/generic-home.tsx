"use client";

// 일반(비개인화) 홈 — 비로그인 방문자의 첫 화면. 모던 프리미엄(라이트) 리디자인.
//   흐름: 히어로 패널(정체성·실수치·CTA) → 주말 수요 예측(미끼) → 지금 태안(라이브) → 콘텐츠 쇼케이스
//         → 멤버십(무료 vs 멤버십·혜택·결제) → 신뢰(편집부 검토·태안신문) → 최신 기사.
//   방침: 가치를 말한다. 숫자는 실데이터(archive/stats)로. 사이트 토큰(brand 네이비·accent 딥틸) 사용, 낙조 오렌지는 포인트.

import { useEffect, useState } from "react";
import Link from "next/link";

import { Icon, type IconName } from "@/components/icon";
import { PersonalizedNewsStrip } from "@/components/home/personalized-news";
import { LiveSummaryStrip } from "@/components/home/live-summary";
import { getArchiveStats, type ArchiveStats } from "@/lib/api/archive";
import { getWeekendDemand, type DemandForecast } from "@/lib/api/reports";

// 히어로 배경(라이트 프리미엄) — 딥틸·낙조 은은한 글로우 + 쿨페이퍼 그라디언트
// 태안 낙조(golden-hour) 분위기 — 우하단 수평선의 지는 해 글로우 + 좌상단 바다 틸, 라이트 베이스는 노을쪽으로 따뜻하게.
const HERO_BG =
  "radial-gradient(58% 62% at 86% 104%, rgba(234,106,23,.17), rgba(240,140,60,.06) 44%, transparent 70%)," +
  "radial-gradient(40% 48% at 9% 7%, rgba(17,110,122,.11), transparent 64%)," +
  "linear-gradient(168deg, #EDF4F3 0%, #F5F7F7 54%, #FBF1E8 100%)";
const GRAD_TEXT = { backgroundImage: "linear-gradient(100deg,#116E7A,#0E5860 55%,#EA6A17)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" } as const;

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
  const totalKo = total ? formatManBun(total) : null; // "10만 4,024"

  return (
    <div className="space-y-12">
      {/* ── Hero 패널 ── */}
      <section className="relative overflow-hidden rounded-[28px] border border-brand/10 px-6 py-12 shadow-card md:px-11 md:py-16" style={{ background: HERO_BG }}>
        {/* 낙조 태양 글로우 — 우하단 수평선에 지는 해(테크 그리드 대신 태안 정체성). */}
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-2 h-72 w-72 rounded-full opacity-70 blur-3xl md:right-16 md:h-80 md:w-80" style={{ background: "radial-gradient(circle, rgba(255,176,102,.55), rgba(234,106,23,.20) 46%, transparent 72%)" }} />
        <div className="relative max-w-3xl">
          <span className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-brand/15 bg-background px-3.5 py-1.5 text-sm font-medium text-foreground-muted shadow-card">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
            <span className="font-semibold text-brand">지금 태안</span> · 실시간 현황을 한눈에
          </span>
          <h1 className="text-[2rem] font-extrabold leading-[1.14] tracking-tight text-brand sm:text-4xl md:text-5xl">
            태안의 <span style={GRAD_TEXT}>어제·오늘·내일</span>을,<br className="hidden sm:block" /> 하나의 지능으로.
          </h1>
          <p className="mt-5 max-w-[60ch] text-base leading-relaxed text-foreground-muted md:text-lg">
            {total ? <><strong className="font-semibold text-brand">{totalKo}건</strong>의 지역 기록과 실시간 현황을, </> : "지역 기록과 실시간 현황을, "}
            자연어로 묻고 <strong className="font-semibold text-brand">근거와 함께</strong> 답을 받으세요. 날씨·바다·수산·관광·부동산까지 — 태안을 아는 단 하나의 창.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/query" className="btn-accent">무엇이든 질문하기 →</Link>
            <Link href="/membership" className="btn-ghost">멤버십 보기</Link>
          </div>
          <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-4 border-t border-brand/10 pt-6">
            {total && <HeroStat value={totalKo!} unit="건" label="지역 기사 아카이브" />}
            {minY && maxY && <HeroStat value={`${minY}–${maxY}`} unit="" label={span ? `${span}년치 기록` : "수록 기간"} />}
            <HeroStat value="100" unit="%" label="편집부 검토 후 발행" />
            <HeroStat value="출처 표기" unit="" label="모든 AI 답변에 근거" />
          </dl>
        </div>
      </section>

      {/* 예측 인사이트 — 이번 주말 관광 수요(미끼) */}
      <WeekendDemandCard />

      {/* 지금 태안 — 라이브 핵심 지표(실데이터) */}
      <LiveSummaryStrip />

      {/* 대표 콘텐츠 쇼케이스 */}
      <section aria-labelledby="showcase-heading">
        <div className="max-w-2xl">
          <p className="eyebrow">둘러보기</p>
          <h2 id="showcase-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-brand md:text-3xl">태안을 읽는 여섯 가지 길</h2>
          <p className="mt-2.5 text-foreground-muted">검색을 넘어, 근거로 답하는 지역 지식 플랫폼. 무엇을 궁금해하든 출처와 함께.</p>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard href="/query" icon="chat" kicker="질의응답 · RAG" title="무엇이든 물어보세요"
            desc="자연어로 묻고, 근거 기사와 실시간 데이터를 함께 답으로 받습니다. 없는 사실은 지어내지 않습니다."
            stat="출처 표기" statLabel="모든 답변에 근거" />
          <FeatureCard href="/news" icon="books" kicker="뉴스 아카이브" title={total ? `${totalKo}건의 태안 기록` : "태안 기사 아카이브"}
            desc="1990년부터 오늘까지, 태안신문 전 기사를 전문 검색합니다. 옛 소식도 한 번에."
            stat={minY && maxY ? `${minY}–${maxY}` : "전 기사"} statLabel="옛 지면까지 검색" />
          <FeatureCard href="/people" icon="link" kicker="지식그래프 온톨로지" title="인물·조직·사건의 관계망"
            desc="기사 속 인물이 누구와 함께, 무엇을 주관했는지 검증된 사실로 연결합니다."
            stat="3.4만+" statLabel="인물 관계망" />
          {/* 아래 3장은 상단 메뉴(지금 태안·해변·지역경제)와 1:1 — 각 페이지의 실제 내용만 약속한다. */}
          <FeatureCard href="/live" icon="signal" kicker="실시간 · 지금 태안" title="지금 태안은 어떤가"
            desc="날씨·대기질·산불 위험·관광 수요·도로 CCTV — 오늘 움직이는 태안을 한 화면에."
            stat="실시간" statLabel="날씨·대기질·도로 CCTV" />
          <FeatureCard href="/beaches" icon="compass" kicker="바다 · 해변" title="이번 주말, 어느 해변?"
            desc="해수욕장별 적합도(수온·파고)와 갯벌 물때, 낚시 출조, 낙조 시각과 해무, 가의도 배 시간표까지."
            stat="6가지" statLabel="바다 정보 한 화면" />
          <FeatureCard href="/data" icon="won" kicker="지역경제 · 실측" title="아파트값부터 위판 시세까지"
            desc="부동산 실거래가·수산물 위판 경매가·장바구니 물가·주유소 유가 — 태안 경제의 실측값."
            stat="26종" statLabel="공개 데이터 출처" />
        </div>
        <p className="mt-4 text-sm text-foreground-muted">
          예측·요약 콘텐츠는 자동 생성 후 <span className="font-semibold text-accent-ink">편집부 검토</span>를 거쳐 발행됩니다.
        </p>
      </section>

      {/* ── 멤버십(전환 핵심) ── */}
      <MembershipSection />

      {/* ── 신뢰 (라이트 패널) ── */}
      <section className="relative overflow-hidden rounded-[28px] border border-accent/20 px-6 py-10 md:px-11 md:py-12" style={{ background: "linear-gradient(180deg,#E7F1F1,#EDF4F4)" }}>
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(234,106,23,.12), transparent 70%)" }} />
        <div className="relative">
          <p className="eyebrow">우리의 약속</p>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-brand md:text-3xl">AI가 거들고, 사람이 확인합니다</h2>
          <p className="mt-3 max-w-[58ch] text-foreground-muted">
            예측과 요약은 발행 전 편집부의 손을 거칩니다. AI 답변에는 언제나 출처를 표기하고, 검증된 사실만 근거로 씁니다 — <strong className="text-brand">지어내지 않는 지역 저널리즘</strong>.
          </p>
          <div className="mt-7 grid gap-6 sm:grid-cols-3">
            <TrustStat value="100%" label="편집부 검토 후 발행" />
            <TrustStat value={span ? `${span}년` : "36년"} label={minY && maxY ? `${minY}–${maxY} 지역 기록` : "지역 기록"} />
            <TrustStat value="시민기자단" label="함께 쓰는 지역 저널리즘" />
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-brand/10 pt-5 text-sm font-semibold text-accent-ink">
            <Link href="/reports" className="hover:underline">주간 리포트 →</Link>
            <Link href="/citizen" className="hover:underline">시민기자단 →</Link>
            <Link href="/data" className="hover:underline">지역경제·데이터 출처 →</Link>
            <span className="ml-auto text-xs font-normal text-foreground-muted">발행: 태안신문 · 2026 지역신문발전위원회 지원 사업</span>
          </div>
        </div>
      </section>

      {/* 실제 최신 기사 */}
      <PersonalizedNewsStrip />
    </div>
  );
}

// 한국어 만/단위: 104024 → "10만 4,024"
function formatManBun(n: number): string {
  if (n < 10000) return n.toLocaleString();
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  return rest === 0 ? `${man}만` : `${man}만 ${rest.toLocaleString()}`;
}

function HeroStat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div>
      <p className="text-xl font-extrabold tracking-tight tabular-nums text-brand md:text-2xl">
        {value}<span className="ml-0.5 text-sm font-semibold text-foreground-muted">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-foreground-muted">{label}</p>
    </div>
  );
}

function TrustStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t-2 border-accent/30 pt-4">
      <p className="text-3xl font-extrabold tabular-nums text-accent-ink md:text-[2rem]">{value}</p>
      <p className="mt-1.5 text-sm text-foreground-muted">{label}</p>
    </div>
  );
}

// ── 멤버십 섹션 ──
const MEMBER_FEATURES: { title: string; desc: string }[] = [
  { title: "업종별 주말·주중 수요 예측", desc: "음식점·숙박·낚시·카페 등 우리 업종에 맞춘 방문 예측 + 준비 체크리스트" },
  { title: "맞춤 알림 (Web Push)", desc: "관심 키워드·기상특보·데이터 급변·군청 공지를 즉시 알림" },
  { title: "수산 위판 시세·경락가 추세", desc: "안흥·백사장 위판 물량·값 주간 전망(사입·판매 타이밍)" },
  { title: "주간 리포트·오디오 브리핑 전체", desc: "발행분 전체 열람 + 낭독으로 듣기" },
  { title: "광고 없는 쾌적한 읽기", desc: "본문 몰입을 방해하지 않는 화면" },
];
const CMP_ROWS: [string, string, string][] = [
  ["AI 질의응답 · 아카이브 검색", "기본", "무제한"],
  ["지금 태안 · 인물 탐색", "✓", "✓"],
  ["이번 주말 수요 예측", "요약", "업종별 상세"],
  ["맞춤 알림(키워드·특보)", "—", "✓"],
  ["위판 시세·경락 추세 예측", "—", "✓"],
  ["주간 리포트·오디오", "일부", "전체"],
  ["광고", "있음", "없음"],
];
const WHO: { emo: string; title: string; desc: string }[] = [
  { emo: "🧑‍🍳", title: "태안 사장님", desc: "업종별 수요·준비 예측으로 매출 준비 — 위판 시세까지" },
  { emo: "👵", title: "효도 구독", desc: "자녀가 결제하고, 부모님은 큰 글씨로 편하게 읽기" },
  { emo: "🏢", title: "단체·기관", desc: "협회·부서 단위 정보 구독(별도 문의·단가 협의)" },
];

function MembershipSection() {
  return (
    <section aria-labelledby="member-heading">
      <div className="max-w-2xl">
        <p className="eyebrow">멤버십</p>
        <h2 id="member-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-brand md:text-3xl">월 9,900원으로, 태안을 앞서 읽다</h2>
        <p className="mt-2.5 text-foreground-muted">무료로도 충분히 둘러볼 수 있습니다. 더 깊은 예측과 맞춤 인사이트가 필요할 때 멤버십으로 — 언제든 해지할 수 있습니다.</p>
      </div>
      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        {/* 요금 카드 */}
        <div className="relative overflow-hidden rounded-3xl border border-brand/15 bg-background p-7 shadow-card md:p-8">
          <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: "linear-gradient(90deg,#116E7A,#EA6A17)" }} />
          <div aria-hidden className="pointer-events-none absolute -right-12 -top-8 h-56 w-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(17,110,122,.10), transparent 70%)" }} />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-subtle/50 px-3 py-1 text-xs font-bold tracking-wide text-accent-ink">⭐ 태안 인사이트 멤버십</span>
            <p className="mt-4 text-[2.7rem] font-extrabold leading-none tracking-tight text-brand"><span className="tabular-nums">9,900</span><span className="text-base font-semibold text-foreground-muted"> 원 / 월</span></p>
            <p className="mt-2 text-sm text-foreground-muted">부가세 포함 · 첫 달 부담 없이 시작 · 약정 없음</p>
            <ul className="mt-6 grid gap-4">
              {MEMBER_FEATURES.map((f) => (
                <li key={f.title} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full bg-accent-subtle/60 text-[0.6875rem] font-black text-accent-ink" style={{ width: "1.4rem", height: "1.4rem" }}>✓</span>
                  <span><b className="block text-[0.98rem] font-semibold text-brand">{f.title}</b><span className="text-sm text-foreground-muted">{f.desc}</span></span>
                </li>
              ))}
            </ul>
            <Link href="/membership" className="btn-accent mt-6 w-full">멤버십 시작하기</Link>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-brand/10 pt-4">
              {["정기결제(카드)", "효도구독", "단체·기관", "무통장 CMS(예정)"].map((p) => (
                <span key={p} className="rounded-full border border-brand/12 bg-brand/[0.03] px-2.5 py-1 text-xs font-medium text-foreground-muted">{p}</span>
              ))}
            </div>
          </div>
        </div>

        {/* 무료 vs 멤버십 + 누구를 위한 */}
        <div>
          <div className="overflow-hidden rounded-2xl border border-brand/10 bg-background shadow-card">
            <div className="grid grid-cols-[1.4fr_1fr_1fr] border-b border-brand/10 bg-brand/[0.03] text-sm font-bold">
              <div className="px-4 py-3.5">기능</div>
              <div className="px-4 py-3.5 text-center text-foreground-muted">무료</div>
              <div className="bg-accent-subtle/40 px-4 py-3.5 text-center text-accent-ink">멤버십</div>
            </div>
            {CMP_ROWS.map(([name, free, pro], i) => (
              <div key={name} className={`grid grid-cols-[1.4fr_1fr_1fr] text-sm ${i < CMP_ROWS.length - 1 ? "border-b border-brand/8" : ""}`}>
                <div className="px-4 py-3 font-medium text-brand">{name}</div>
                <div className="px-4 py-3 text-center text-foreground-muted">{free}</div>
                <div className="bg-accent-subtle/25 px-4 py-3 text-center font-bold text-accent-ink">{pro}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2.5">
            {WHO.map((w) => (
              <div key={w.title} className="flex items-start gap-3 rounded-2xl border border-brand/10 bg-background p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-subtle/40 text-xl leading-none" aria-hidden>{w.emo}</span>
                <span><b className="block text-brand">{w.title}</b><span className="text-sm text-foreground-muted">{w.desc}</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// 이번 주말 관광 수요 지수 — 규칙기반 예측. 방문자용 대표 예측 + 사장님 전환 미끼.
function WeekendDemandCard() {
  const [d, setD] = useState<DemandForecast | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getWeekendDemand().then((r) => { if (alive) setD(r); }).catch(() => { if (alive) setD(null); });
    return () => { alive = false; };
  }, []);
  if (d === undefined) return <div className="h-44 animate-pulse rounded-3xl bg-brand/5" aria-hidden />;
  if (!d) return null;
  const high = d.level === "매우높음" || d.level === "높음";
  const low = d.level === "낮음" || d.level === "매우낮음";
  const badgeCls = high ? "bg-[#FBE4CF] text-[#B4480A]" : low ? "bg-blue-100 text-blue-800" : "bg-accent-subtle/50 text-accent-ink";
  const top = d.factors.filter((f) => Math.abs(f.effect) >= 1).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 3);
  const wx = (w: DemandForecast["weather"]["sat"], day: string) => w
    ? <span>{day} {w.tmax != null ? `${w.tmax}°` : ""}{w.pop != null ? ` · 강수 ${w.pop}%` : ""}</span> : null;
  return (
    <section aria-labelledby="demand-heading">
      <div className="max-w-2xl">
        <p className="eyebrow">예측 인사이트 · 이번 주말</p>
        <h2 id="demand-heading" className="mt-3 text-2xl font-extrabold tracking-tight text-brand md:text-3xl">이번 주말 태안, 얼마나 붐빌까요?</h2>
        <p className="mt-2.5 text-foreground-muted">날씨·물때·축제·연휴·계절을 종합한 관광 수요 예측 — 매주 실제와 대조해 적중률을 공개합니다.</p>
      </div>
      <div className="relative mt-6 overflow-hidden rounded-3xl border border-brand/10 bg-background p-6 shadow-card md:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(17,110,122,.10), transparent 70%)" }} />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-[60%] min-w-[240px]">
            <p className="text-xs font-semibold uppercase tracking-kicker text-foreground-muted">{d.weekend.sat} ~ {d.weekend.sun.slice(5)}</p>
            <p className="mt-2 text-base font-bold leading-relaxed text-brand md:text-lg">{d.headline}</p>
            {top.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-2 text-sm">
                {top.map((f, i) => (
                  <span key={i} className="rounded-full bg-accent-subtle/50 px-3 py-1 font-medium text-accent-ink" title={f.detail}>{f.effect >= 0 ? "+" : ""}{f.effect} {f.label}</span>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-5xl font-extrabold leading-none tabular-nums text-accent-ink md:text-6xl">{d.index}<span className="text-lg font-bold text-foreground-muted">/100</span></div>
            <span className={`mt-2 inline-block rounded-full px-3.5 py-1 text-sm font-bold ${badgeCls}`}>{d.level}</span>
          </div>
        </div>
        {(d.weather.sat || d.weather.sun) && (
          <div className="relative mt-4 flex gap-6 border-t border-brand/10 pt-3 text-sm text-foreground-muted">{wx(d.weather.sat, "토")}{wx(d.weather.sun, "일")}</div>
        )}
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand/[0.04] px-4 py-3.5">
          <p className="text-sm text-foreground-muted">우리 가게는 이번 주말 어떻게 준비할까요? <strong className="text-brand">업종별 상세 예측 · 준비 체크리스트</strong></p>
          <Link href="/membership?utm_source=demand" className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-background hover:opacity-90">사장님 멤버십 →</Link>
        </div>
        <p className="relative mt-2.5 text-[0.6875rem] text-foreground-muted">규칙기반 예측(날씨·물때·축제·연휴·계절). 예측과 실제를 대조해 적중률을 공개합니다.</p>
      </div>
    </section>
  );
}

function FeatureCard({ href, icon, kicker, title, desc, stat, statLabel }: {
  href: string; icon: IconName; kicker: string; title: string; desc: string; stat: string; statLabel: string;
}) {
  return (
    <Link href={href} className="card card-lift group flex flex-col p-6">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-subtle/50 text-accent-ink"><Icon name={icon} size="1.2em" /></span>
      <span className="mt-4 text-xs font-bold uppercase tracking-kicker text-accent-ink">{kicker}</span>
      <h3 className="mt-2 text-xl font-extrabold text-brand group-hover:text-accent-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{desc}</p>
      <div className="mt-auto flex items-baseline gap-2 border-t border-brand/10 pt-4">
        <span className="text-lg font-extrabold tabular-nums text-brand">{stat}</span>
        <span className="text-xs text-foreground-muted">{statLabel}</span>
        <span className="ml-auto self-center font-bold text-accent transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
      </div>
    </Link>
  );
}
