import type { Metadata } from "next";

import Link from "next/link";

import { fetchReportMetrics, fetchLatestReport, fetchWeeklyNews, fetchOnThisDay, fetchCctv, fetchSeafog } from "@/lib/api/reports";
import {
  SummaryInfographic, WeatherCards, AirQualityTrend, MarineCard,
  DemandGauge, FestivalList, SeasonalFoodCard, OilCard,
} from "@/components/reports/report-charts";
import { CctvPlayer } from "@/components/reports/cctv-player";

export const metadata: Metadata = {
  title: "지금 태안",
  description: "태안의 실시간 날씨·대기질·바다(수온·파고·물때)·자외선·관광 수요를 한 화면에.",
  openGraph: { title: "지금 태안 — 실시간 현황", description: "날씨·대기질·바다·물때·관광 수요를 한눈에", type: "website", locale: "ko_KR", siteName: "태안 AI 인텔리전스" },
};

// 실시간성 위주 — 1분 ISR(metrics는 백엔드 스냅샷이 30분 주기로 신선)
export const revalidate = 60;

function decodeEntities(s: string): string {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#039;/g, "'");
}

export default async function LivePage() {
  const [metrics, latest, onThisDay, cctv, seafog] = await Promise.all([fetchReportMetrics(), fetchLatestReport(), fetchOnThisDay(8), fetchCctv(), fetchSeafog()]);
  const news = latest ? await fetchWeeklyNews(latest.weekId) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="border-b-2 border-brand/15 pb-6">
        <p className="eyebrow">
          <span className="inline-block h-px w-6 bg-accent" aria-hidden />
          LIVE · 지금 태안
        </p>
        <h1 className="mt-3 font-display text-display text-brand">지금 태안</h1>
        <p className="mt-2 max-w-prose text-base leading-relaxed text-foreground-muted">
          실시간 날씨·대기질·바다·물때·관광 수요를 한 화면에.
        </p>
      </div>

      {!metrics ? (
        <div className="mt-10 rounded-2xl border border-brand/10 bg-white/60 p-8 text-center shadow-soft">
          <p className="text-4xl" aria-hidden>📡</p>
          <p className="mt-4 text-sm text-foreground-muted">실시간 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* 핵심 지표 */}
          <section className="mt-6">
            <SummaryInfographic metrics={metrics} />
          </section>

          {/* 날씨·대기질 */}
          <section>
            <h2 className="text-display-sm font-bold text-brand"><span className="mr-2" aria-hidden>⛅</span>날씨·대기질</h2>
            <span className="accent-rule mt-3" aria-hidden />
            <WeatherCards env={metrics.environment} />
            <AirQualityTrend env={metrics.environment} />
          </section>

          {/* 바다 */}
          <section>
            <h2 className="text-display-sm font-bold text-brand"><span className="mr-2" aria-hidden>🌊</span>바다·해변</h2>
            <span className="accent-rule mt-3" aria-hidden />
            <MarineCard marine={metrics.tourism.marine} />
          </section>

          {/* 관광 */}
          <section>
            <h2 className="text-display-sm font-bold text-brand"><span className="mr-2" aria-hidden>🧳</span>관광·이벤트</h2>
            <span className="accent-rule mt-3" aria-hidden />
            <DemandGauge demand={metrics.tourism.demand} />
            <FestivalList tour={metrics.tourism} />
            <SeasonalFoodCard />
          </section>

          {/* 지역경제 */}
          <section>
            <h2 className="text-display-sm font-bold text-brand"><span className="mr-2" aria-hidden>🏘</span>지역경제</h2>
            <span className="accent-rule mt-3" aria-hidden />
            <OilCard oil={metrics.oil} />
          </section>

          {/* 도로 실시간 CCTV */}
          {cctv.available && (
            <section>
              <h2 className="text-display-sm font-bold text-brand"><span className="mr-2" aria-hidden>📹</span>도로 실시간 CCTV</h2>
              <span className="accent-rule mt-3" aria-hidden />
              <div className="mt-4"><CctvPlayer cameras={cctv.cameras} updatedAt={cctv.updatedAt} /></div>
            </section>
          )}

          {/* 해무 관측 스틸컷 */}
          {seafog.available && (
            <section>
              <h2 className="text-display-sm font-bold text-brand"><span className="mr-2" aria-hidden>🌫</span>해안 해무 관측</h2>
              <span className="accent-rule mt-3" aria-hidden />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {seafog.stills.map((s) => (
                  <figure key={s.station} className="overflow-hidden rounded-2xl border border-brand/15 bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.url} alt={`${s.station} 해무 CCTV`} className="aspect-video w-full object-cover" loading="lazy" />
                    <figcaption className="flex items-center justify-between bg-background px-3 py-2 text-xs">
                      <span className="font-semibold text-brand">{s.station}</span>
                      <span className="text-foreground-muted">{s.imgDt.slice(5)} 기준</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className="mt-2 text-xs text-foreground-muted">국립해양조사원 해무관측소 · 10분 단위 · 태안 인근 서해</p>
            </section>
          )}

          {/* 최신 태안뉴스 */}
          {news.length > 0 && (
            <section>
              <h2 className="text-display-sm font-bold text-brand"><span className="mr-2" aria-hidden>📰</span>최신 태안뉴스</h2>
              <span className="accent-rule mt-3" aria-hidden />
              <ul className="mt-4 divide-y divide-brand/10">
                {news.slice(0, 12).map((n) => (
                  <li key={n.idxno}>
                    <Link href={`/news/${n.idxno}`} className="group flex items-baseline gap-3 py-3 transition-colors hover:bg-brand/5">
                      <time className="w-16 shrink-0 text-xs tabular-nums text-foreground-muted">{n.publishedAt.slice(5, 10).replace("-", ".")}</time>
                      <span className="flex-1 text-[0.97rem] leading-snug text-foreground group-hover:text-brand">{decodeEntities(n.title)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/news" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">태안뉴스 전체 보기 →</Link>
            </section>
          )}

          {/* 역대 오늘, 태안 — 같은 날짜 과거 주요뉴스 랜덤 */}
          {onThisDay.length > 0 && (
            <section>
              <h2 className="text-display-sm font-bold text-brand"><span className="mr-2" aria-hidden>📜</span>역대 오늘, 태안</h2>
              <span className="accent-rule mt-3" aria-hidden />
              <p className="mt-2 text-sm text-foreground-muted">오늘과 같은 날짜, 창간호까지 거슬러 그해의 주요 뉴스 · 새로고침마다 다르게</p>
              <ul className="mt-4 divide-y divide-brand/10">
                {onThisDay.map((a) => (
                  <li key={a.idxno}>
                    <Link href={`/news/${a.idxno}`} className="group flex items-baseline gap-3 py-3 transition-colors hover:bg-brand/5">
                      <span className="w-24 shrink-0 text-xs font-semibold tabular-nums text-accent">{a.yearsAgo}년 전 · {a.year}</span>
                      <span className="flex-1 text-[0.97rem] leading-snug text-foreground group-hover:text-brand">{decodeEntities(a.title)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/archive" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">아카이브 전체 보기 →</Link>
            </section>
          )}

          <p className="hairline pt-6 text-center text-xs text-foreground-muted">
            출처 기상청·에어코리아·국립해양조사원·국토교통부·오피넷·태안신문 · 무료 공공데이터
          </p>
        </div>
      )}
    </div>
  );
}
