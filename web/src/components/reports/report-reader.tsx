"use client";

// 주간 리포트 뷰어 — 에디토리얼 매거진 레이아웃.
// 서버가 익명 미리보기를 initialReport로 주입 → 마운트 후 로그인 등급(segment)을 감지해
// 구독자면 전체본으로 자동 교체. 잠금 섹션은 블러+자물쇠 카드.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { AILabelBadge } from "@/components/ai-label-badge";
import { AirQualityTrend, WeatherCards, RealEstatePanel, FestivalList, DemandGauge, MarineCard, SummaryInfographic, SeasonalFoodCard, OilCard } from "@/components/reports/report-charts";
import { ReportTTS } from "@/components/reports/report-tts";
import { ReportPushButton } from "@/components/reports/report-push";
import { EmailSignup } from "@/components/reports/email_signup";
import { fetchLatestReport, type WeeklyReportView, type WeeklyNewsItem, type GovNoticeItem, type ReportMetrics } from "@/lib/api/reports";
import { getUid } from "@/lib/uid";
import { CATEGORY_LABELS } from "@/lib/types";

// HTML 엔티티 디코딩 (제목에 &#039; 등 그대로 남는 경우 방지)
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function formatWeek(weekId: string): string {
  const m = weekId.match(/^(\d{4})-W(\d{2})$/);
  return m ? `${m[1]}년 ${Number(m[2])}주차` : weekId;
}

// 섹션 키별 아이콘 (시각적 구분)
const SECTION_ICON: Record<string, string> = {
  summary: "📋",
  tourism_weather: "⛅",
  environment: "🌊",
  realestate: "🏘",
  events: "📅",
};

const FILLER =
  "이 섹션은 구독자에게 제공되는 상세 분석입니다. 수치와 출처, 다음 주 전망이 담겨 있습니다. 태안 지역의 환경·관광·부동산 흐름을 한눈에 정리했습니다. 구독하시면 전체 내용을 보실 수 있어요.";

// 섹션 키 → 해당 섹션 아래에 붙일 시각화(차트·표·카드). 잠금/미리보기 섹션엔 미표시.
function SectionVisual({ sectionKey, metrics }: { sectionKey: string; metrics: ReportMetrics | null }) {
  if (!metrics) return null;
  switch (sectionKey) {
    case "tourism_weather":
      return (
        <>
          <DemandGauge demand={metrics.tourism.demand} />
          <WeatherCards env={metrics.environment} />
          <MarineCard marine={metrics.tourism.marine} />
        </>
      );
    case "environment":
      return <AirQualityTrend env={metrics.environment} />;
    case "realestate":
      return (
        <>
          <RealEstatePanel re={metrics.realestate} />
          <OilCard oil={metrics.oil} />
        </>
      );
    case "events":
      return (
        <>
          <FestivalList tour={metrics.tourism} />
          <SeasonalFoodCard />
        </>
      );
    default:
      return null;
  }
}

export function ReportReader({
  initialReport,
  metrics = null,
  news = [],
  govNotices = [],
  cardNews = [],
}: {
  initialReport: WeeklyReportView | null;
  metrics?: ReportMetrics | null;
  news?: WeeklyNewsItem[];
  govNotices?: GovNoticeItem[];
  cardNews?: GovNoticeItem[];
}) {
  const [report, setReport] = useState<WeeklyReportView | null>(initialReport);
  const textNotices = govNotices.filter((n) => n.board_name !== "카드뉴스");

  // 마운트 후 익명 uid로 개인화본 요청 — 저장된 관심사 기준 정렬·강조 + 등급 게이팅
  useEffect(() => {
    const uid = getUid();
    if (!uid) return;
    let cancelled = false;
    fetchLatestReport(undefined, uid).then((r) => { if (!cancelled && r) setReport(r); });
    return () => { cancelled = true; };
  }, []);

  // ── 발행 전 ──
  if (!report) {
    return (
      <div className="mx-auto max-w-3xl">
        <Masthead weekLabel="" publishedAt="" aiLabel="ai_assisted" gated={false} />
        <div className="mt-10 rounded-2xl border border-brand/10 bg-white/60 p-8 text-center shadow-soft">
          <p className="text-4xl" aria-hidden>🗞️</p>
          <p className="mt-4 text-lg font-semibold text-brand">아직 발행된 리포트가 없습니다</p>
          <p className="mt-2 text-sm text-foreground-muted">첫 호가 곧 발행됩니다. 매주 금요일에 만나요.</p>
        </div>
      </div>
    );
  }

  // 음성 브리핑 텍스트 — 잠금 안 된 섹션(요약·미리보기) 본문을 제목과 함께 이어붙임
  const briefing = [
    `${formatWeek(report.weekId)} 태안 인사이트 리포트입니다.`,
    ...report.sections.filter((s) => !s.locked && s.content.trim()).map((s) => `${s.title}. ${s.content}`),
  ].join("\n");

  return (
    <div className="mx-auto max-w-3xl">
      <Masthead
        weekLabel={formatWeek(report.weekId)}
        publishedAt={report.publishedAt}
        aiLabel={report.aiLabel}
        gated={report.gated}
      />

      <div className="no-print mt-4 flex flex-wrap justify-end gap-1">
        <ReportPushButton />
        <ReportTTS text={briefing} label="리포트 듣기" />
      </div>

      {report.personalized && report.interests?.length ? (
        <div className="no-print mt-6 flex items-center gap-2 rounded-xl bg-accent-subtle/30 px-4 py-2.5 text-sm">
          <span aria-hidden>⭐</span>
          <span className="text-brand">
            <strong>{report.interests.map((c) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c).join("·")}</strong> 관심사 기준으로 정렬됐어요
          </span>
        </div>
      ) : null}

      <div className="mt-10 space-y-14">
        {report.sections.map((s, i) => (
          <section
            key={s.key}
            className={`break-inside-avoid scroll-mt-28 ${s.emphasis === "show_small" && !s.locked ? "opacity-65" : ""}`}
          >
            {/* 섹션 헤더 */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-3xl font-bold leading-none text-accent/70 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="text-display-sm font-bold text-brand">
                <span className="mr-2" aria-hidden>{SECTION_ICON[s.key] ?? "•"}</span>
                {s.title}
              </h2>
              {s.matched && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[0.7rem] font-semibold text-background">⭐ 내 관심</span>
              )}
            </div>
            <span className="accent-rule mt-3" aria-hidden />

            {/* 본문 */}
            {s.locked ? (
              <div className="relative mt-5 overflow-hidden rounded-2xl border border-brand/10 bg-white/50">
                <p aria-hidden className="select-none px-6 py-7 leading-loose text-foreground-muted blur-[6px]">
                  {FILLER}
                </p>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60">
                  <span className="text-2xl" aria-hidden>🔒</span>
                  <span className="text-sm font-medium text-brand">구독자 전용 섹션</span>
                  <Link href="/me" className="btn-accent no-print px-5 py-2 text-xs">
                    구독하고 전체 보기
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                {s.key === "summary" && <SummaryInfographic metrics={metrics} govCount={textNotices.length + cardNews.length} />}
                <p className={`whitespace-pre-line text-[1.05rem] leading-[1.85] text-foreground ${s.key === "summary" ? "mt-6" : ""}`}>{s.content}</p>
                {!s.truncated && <SectionVisual sectionKey={s.key} metrics={metrics} />}
                {s.truncated && (
                  <Link href="/me" className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
                    … 이어 보기 (구독)
                  </Link>
                )}
                {s.sources.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-brand/10 pt-4">
                    <span className="text-xs font-semibold uppercase tracking-kicker text-foreground-muted">출처</span>
                    {s.sources.map((src, k) => (
                      <span key={k} className="rounded-full bg-brand/5 px-3 py-1 text-xs text-foreground-muted">
                        {src.url ? <a href={src.url} className="hover:text-brand hover:underline">{src.title}</a> : src.title}
                        {src.publisher ? ` · ${src.publisher}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        ))}
      </div>

      {report.gated && (
        <div className="no-print mt-14 rounded-2xl border border-accent/30 bg-accent-subtle/30 p-6 text-center">
          <p className="text-sm font-semibold text-brand">지금은 미리보기입니다</p>
          <p className="mt-1 text-sm text-foreground-muted">구독하면 전체 섹션과 출처를 모두 보실 수 있어요.</p>
          <Link href="/me" className="btn-accent mt-4 inline-flex">구독하고 전체 리포트 보기</Link>
        </div>
      )}

      {/* 태안군청 카드뉴스 — 한 화면 스와이프 캐러셀 */}
      {cardNews.length > 0 && (
        <section className="mt-16 break-inside-avoid border-t-2 border-brand/15 pt-8">
          <p className="eyebrow">
            <span className="inline-block h-px w-6 bg-accent" aria-hidden />
            태안군청 카드뉴스
          </p>
          <h2 className="mt-3 text-display-sm font-bold text-brand">한눈에 보는 군정 카드뉴스</h2>
          <CardNewsCarousel items={cardNews} />
        </section>
      )}

      {/* 태안군청 군정 소식 — 원문 게시물 링크(카드) */}
      {textNotices.length > 0 && (
        <section className="mt-16 break-inside-avoid border-t-2 border-brand/15 pt-8">
          <p className="eyebrow">
            <span className="inline-block h-px w-6 bg-accent" aria-hidden />
            태안군청
          </p>
          <h2 className="mt-3 text-display-sm font-bold text-brand">군정 소식 · 행사 일정</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {textNotices.map((n, i) => (
              <a
                key={i}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="card-lift group flex flex-col rounded-xl border border-brand/10 bg-white/60 p-4 shadow-soft"
              >
                <div className="flex items-center gap-2">
                  <BoardBadge name={n.board_name} />
                  <time className="text-xs tabular-nums text-foreground-muted">
                    {n.published_at?.slice(5, 10).replace("-", ".")}
                  </time>
                </div>
                <p className="mt-2 line-clamp-2 text-[0.95rem] font-medium leading-snug text-foreground group-hover:text-brand">
                  {decodeEntities(n.title)}
                </p>
                <span className="mt-auto pt-2 text-xs text-foreground-muted">
                  {n.dept ? `${n.dept} · ` : ""}태안군청 원문 ↗
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* 이번 주 태안신문 뉴스 — 아카이브 기반 링크(AI 생성 아님) */}
      {news.length > 0 && (
        <section className="mt-16 break-inside-avoid border-t-2 border-brand/15 pt-8">
          <p className="eyebrow">
            <span className="inline-block h-px w-6 bg-accent" aria-hidden />
            이번 주 태안신문
          </p>
          <h2 className="mt-3 text-display-sm font-bold text-brand">한 주간의 주요 뉴스</h2>
          <ul className="mt-6 divide-y divide-brand/10">
            {news.map((n) => (
              <li key={n.idxno}>
                <Link
                  href={`/news/${n.idxno}`}
                  className="group flex items-baseline gap-3 py-3 transition-colors hover:bg-brand/5"
                >
                  <time className="w-20 shrink-0 text-xs tabular-nums text-foreground-muted">
                    {n.publishedAt.slice(5, 10).replace("-", ".")}
                  </time>
                  <span className="flex-1 text-[0.97rem] leading-snug text-foreground group-hover:text-brand">
                    {decodeEntities(n.title)}
                  </span>
                  {n.category && (
                    <span className="hidden shrink-0 rounded-full bg-brand/5 px-2 py-0.5 text-[0.7rem] text-foreground-muted sm:inline">
                      {n.category}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/news" className="mt-4 inline-block text-sm font-semibold text-accent hover:underline">
            태안뉴스 전체 보기 →
          </Link>
        </section>
      )}

      <EmailSignup />

      <div className="hairline mt-16 pt-6 text-center text-xs text-foreground-muted">
        태안 인사이트 · 모든 AI 콘텐츠는 편집부 검토(HITL)를 거쳐 발행됩니다.
      </div>
    </div>
  );
}

// 카드뉴스 캐러셀 — 모든 게시물의 이미지를 한 화면에서 스와이프(상단 제목 표시)
function CardNewsCarousel({ items }: { items: GovNoticeItem[] }) {
  // 게시물별 이미지를 평탄화 — 각 슬라이드에 소속 제목·날짜·원문 유지
  const slides = items.flatMap((n) => {
    const imgs = n.images && n.images.length ? n.images : n.image_url ? [n.image_url] : [];
    return imgs.map((img) => ({ img, title: decodeEntities(n.title), date: n.published_at, url: n.url }));
  });
  const [index, setIndex] = useState(0);
  const [popupOpen, setPopupOpen] = useState(false);

  // 인접 슬라이드(다음/이전)만 미리 로드 → 초기 5MB 일괄로딩 방지 + 다음 넘김 즉시
  useEffect(() => {
    [1, -1].forEach((d) => {
      const s = slides[(index + d + slides.length) % slides.length];
      if (s) { const im = new window.Image(); im.src = s.img; }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (!slides.length) return null;
  const cur = slides[Math.min(index, slides.length - 1)];
  const go = (d: number) => setIndex((i) => (i + d + slides.length) % slides.length);

  let touchX = 0;
  let touchY = 0;
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-soft">
      {/* 상단 제목 바 */}
      <div className="flex items-center justify-between gap-3 border-b border-brand/10 px-4 py-3">
        <p className="line-clamp-1 text-sm font-semibold text-brand">{cur.title}</p>
        <div className="flex shrink-0 items-center gap-3 text-xs text-foreground-muted">
          <span>{cur.date?.slice(0, 10)}</span>
          {cur.url && (
            <a href={cur.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">
              원문 ↗
            </a>
          )}
        </div>
      </div>

      {/* 이미지 무대 — 전체 이미지를 스크롤 없이 맞춤. 자세히 보기는 ⛶ 팝업. */}
      <div className="relative" style={{ height: "min(70vh, 36rem)" }}>
        <button
          type="button"
          onClick={() => setPopupOpen(true)}
          aria-label="크게 보기"
          className="flex h-full w-full items-center justify-center overflow-hidden bg-brand/5"
          onTouchStart={(e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - touchX;
            const dy = e.changedTouches[0].clientY - touchY;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cur.img} alt={cur.title} draggable={false} className="max-h-full max-w-full cursor-zoom-in object-contain" />
        </button>

        {/* 크게 보기 버튼 (고정) */}
        <div className="absolute right-2 top-2">
          <button type="button" onClick={() => setPopupOpen(true)} aria-label="크게 보기" className="h-9 w-9 rounded-full bg-accent text-sm text-background shadow hover:opacity-90">⛶</button>
        </div>

        {slides.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="이전"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-brand/70 px-3 py-4 text-xl text-background shadow hover:bg-brand">‹</button>
            <button type="button" onClick={() => go(1)} aria-label="다음"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-brand/70 px-3 py-4 text-xl text-background shadow hover:bg-brand">›</button>
            <span className="absolute bottom-3 left-3 rounded-full bg-brand/70 px-2 py-0.5 text-xs text-background shadow">
              {index + 1} / {slides.length}
            </span>
          </>
        )}
      </div>

      {/* 점 인디케이터 */}
      {slides.length > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 px-4 py-3">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${i + 1}번째 보기`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-accent" : "w-1.5 bg-brand/20 hover:bg-brand/40"}`}
            />
          ))}
        </div>
      )}

      {popupOpen && (
        <ImagePopup slides={slides} index={index} setIndex={setIndex} onClose={() => setPopupOpen(false)} />
      )}
    </div>
  );
}

// 카드뉴스 전체화면 팝업 뷰어 — 크게 + 스크롤 + 줌 + 넘김
function ImagePopup({
  slides,
  index,
  setIndex,
  onClose,
}: {
  slides: { img: string; title: string; date?: string; url?: string }[];
  index: number;
  setIndex: (i: number) => void;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const cur = slides[index];
  const go = (d: number) => setIndex((index + d + slides.length) % slides.length);

  useEffect(() => {
    setScale(1);
    if (stageRef.current) { stageRef.current.scrollTop = 0; stageRef.current.scrollLeft = 0; }
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    // 팝업 동안 배경 스크롤 잠금
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, slides.length]);

  let tx = 0, ty = 0;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm">
      {/* 상단 바 */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-background">
        <span className="line-clamp-1 text-sm font-medium">{cur.title}</span>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <span className="text-background/70">{index + 1} / {slides.length}</span>
          {cur.url && <a href={cur.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">원문 ↗</a>}
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full px-2 text-xl hover:bg-white/10">✕</button>
        </div>
      </div>

      {/* 스크롤·줌 무대 */}
      <div
        ref={stageRef}
        className="relative flex-1 overflow-auto"
        onDoubleClick={() => setScale((s) => (s > 1 ? 1 : 2))}
        onTouchStart={(e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - tx;
          const dy = e.changedTouches[0].clientY - ty;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className="mx-auto" style={{ width: `${scale * 100}%`, maxWidth: scale === 1 ? "56rem" : "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cur.img} alt={cur.title} draggable={false} className="block h-auto w-full" />
        </div>
      </div>

      {/* 컨트롤 */}
      <div className="absolute right-3 top-16 flex flex-col gap-1">
        <button type="button" onClick={() => setScale((s) => Math.min(3, s + 0.5))} aria-label="확대" className="h-9 w-9 rounded-full bg-white/15 text-lg text-background hover:bg-white/30">＋</button>
        <button type="button" onClick={() => setScale((s) => Math.max(1, s - 0.5))} aria-label="축소" className="h-9 w-9 rounded-full bg-white/15 text-lg text-background hover:bg-white/30">－</button>
      </div>
      {slides.length > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="이전" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-5 text-2xl text-background hover:bg-white/30">‹</button>
          <button type="button" onClick={() => go(1)} aria-label="다음" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-5 text-2xl text-background hover:bg-white/30">›</button>
        </>
      )}
    </div>
  );
}

// 게시판별 배지 색
function BoardBadge({ name }: { name: string }) {
  const style =
    name === "주간행사계획"
      ? "bg-accent text-background"
      : name === "공지사항"
        ? "bg-brand text-background"
        : "bg-brand/10 text-brand";
  return <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${style}`}>{name}</span>;
}

// ── 마스트헤드 ──
function Masthead({
  weekLabel,
  publishedAt,
  aiLabel,
  gated,
}: {
  weekLabel: string;
  publishedAt: string;
  aiLabel: "human" | "ai_assisted" | "ai_generated";
  gated: boolean;
}) {
  return (
    <div className="border-b-2 border-brand/15 pb-8">
      <p className="eyebrow">
        <span className="inline-block h-px w-6 bg-accent" aria-hidden />
        WEEKLY INSIGHT REPORT
      </p>
      <h1 className="mt-4 font-display text-display text-brand">주간 인사이트 리포트</h1>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-foreground-muted">
        관광·기상·환경·부동산, 태안의 다음 주를 한 페이지로.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {weekLabel && (
          <span className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-background">{weekLabel}</span>
        )}
        <AILabelBadge kind={aiLabel} />
        {publishedAt && (
          <span className="text-foreground-muted">
            {new Date(publishedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} 발행
          </span>
        )}
        {!gated && weekLabel && (
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-ghost no-print ml-auto px-4 py-2 text-xs"
          >
            🖨 PDF로 저장
          </button>
        )}
      </div>
    </div>
  );
}
