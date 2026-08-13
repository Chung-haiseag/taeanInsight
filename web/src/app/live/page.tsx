import type { Metadata } from "next";

import Link from "next/link";

import { fetchReportMetrics, fetchLatestReport, fetchWeeklyNews, fetchOnThisDay, fetchCctv, fetchTvNews, getAgriPrices, getSeafood, getAuction, getAuctionForecast, getSeasonal, getDust, getBloom, getFireRisk, getFarm, getAqua, getTodayBrief, getFestivals, getWeatherAlert } from "@/lib/api/reports";
import {
  SummaryInfographic, WeatherAirCard,
  DemandGauge, FestivalList, OilCard, RealEstatePanel, AgriCard, SeafoodCard, AuctionCard, AuctionForecastCard, SeasonalCard, DustCard, BloomCard, FireRiskCard, FarmCard, AquaCard, IndustryStructure, FestivalCalendar, WeatherAlertBanner,
} from "@/components/reports/report-charts";
import { TodayBriefBanner } from "@/components/reports/today-brief-banner";
import { CctvPlayer } from "@/components/reports/cctv-player";
import { TvVideoTheater } from "@/components/tv-video-grid";
import { PageHeader } from "@/components/page-header";
import { LiveClock } from "@/components/live-clock";
import { MembershipNudge } from "@/components/membership-nudge";

export const metadata: Metadata = {
  title: "지금 태안",
  description: "태안의 실시간 날씨·대기질·도로 CCTV·관광 수요·지역경제를 한 화면에. (바다·해변·낙조·물때는 해변 페이지)",
  openGraph: { title: "지금 태안 — 실시간 현황", description: "날씨·대기질·바다·물때·관광 수요를 한눈에", type: "website", locale: "ko_KR", siteName: "태안 인사이트" },
};

// 실시간성 위주 — 3분 ISR(metrics 스냅샷 30분·도매 일단위라 60초는 과함, 재생성 부하만 큼)
export const revalidate = 180;

function decodeEntities(s: string): string {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#039;/g, "'");
}

export default async function LivePage() {
  // 전부 즉시 병렬 시작(순차 대기 제거) — 주간뉴스만 최신 리포트 주차에 의존하므로 그 안에서 체이닝.
  //   이전엔 fetchLatestReport()를 단독으로 먼저 await해 20개 무관 fetch가 그 뒤에야 시작되던 워터폴(~2.9s).
  // 바다·해변·해무·낙조는 /beaches(바다 종합 허브)로 이관 — 겹침 제거 + /live 페치 축소(성능).
  const [metrics, onThisDay, cctv, news, tvNews, agri, seafood, auction, auctionForecast, seasonal, dust, bloom, fireRisk, farm, aqua, todayBrief, festivals, weatherAlert] = await Promise.all([
    fetchReportMetrics(),
    fetchOnThisDay(8),
    fetchCctv(),
    fetchLatestReport().then((r) => (r ? fetchWeeklyNews(r.weekId) : [])),
    fetchTvNews(8),
    getAgriPrices(),
    getSeafood(),
    getAuction(),
    getAuctionForecast(),
    getSeasonal(),
    getDust(),
    getBloom(),
    getFireRisk(),
    getFarm(),
    getAqua(),
    getTodayBrief(),
    getFestivals(),
    getWeatherAlert(),
  ]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        eyebrow="LIVE · 지금 태안"
        title="지금 태안"
        description="실시간 날씨·대기질·도로·관광 수요·지역경제를 한 화면에."
        actions={<LiveClock />}
      />

      <WeatherAlertBanner alert={weatherAlert} />
      <TodayBriefBanner brief={todayBrief} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />

      {!metrics ? (
        <div className="mt-10 card p-8 text-center">
          <p className="text-4xl" aria-hidden>📡</p>
          <p className="mt-4 text-sm text-foreground-muted">실시간 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* 핵심 지표 */}
          <section className="mt-6">
            <SummaryInfographic metrics={metrics} />
            <p className="mt-3 text-right text-sm">
              <Link href="/reports#data" className="font-semibold text-accent hover:underline">기간별 추세·CSV 다운로드 → 주간 리포트 · 데이터 부록</Link>
            </p>
          </section>

          {/* 날씨·대기질 */}
          <section>
            <h2 className="text-xl font-bold text-brand">날씨·대기질</h2>
            <span className="accent-rule mt-3" aria-hidden />
            <WeatherAirCard env={metrics.environment} />
            <DustCard dust={dust} />
            <FireRiskCard fire={fireRisk} />
          </section>

          {/* 관광 */}
          <section>
            <h2 className="text-xl font-bold text-brand">관광·이벤트</h2>
            <span className="accent-rule mt-3" aria-hidden />
            <DemandGauge demand={metrics.tourism.demand} />
            <BloomCard bloom={bloom} />
            <FestivalCalendar festivals={festivals} />
            <FestivalList tour={metrics.tourism} />
          </section>

          {/* 지역경제 */}
          <section>
            <h2 className="text-xl font-bold text-brand">지역경제</h2>
            <span className="accent-rule mt-3" aria-hidden />
            <RealEstatePanel re={metrics.realestate} compact />
            <AgriCard agri={agri} />
            <FarmCard farm={farm} />
            <AquaCard aqua={aqua} />
            <SeafoodCard seafood={seafood} />
            <AuctionCard auction={auction} />
            <AuctionForecastCard forecast={auctionForecast} />
            <SeasonalCard seasonal={seasonal} />
            <OilCard oil={metrics.oil} />
            <IndustryStructure />
          </section>

          {/* 도로 실시간 CCTV */}
          {cctv.available && (
            <section>
              <h2 className="text-xl font-bold text-brand">도로 실시간 CCTV</h2>
              <span className="accent-rule mt-3" aria-hidden />
              <div className="mt-4"><CctvPlayer cameras={cctv.cameras} updatedAt={cctv.updatedAt} /></div>
            </section>
          )}

          {/* 최신 태안뉴스 */}
          {news.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-brand">최신 태안뉴스</h2>
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

          {/* 태안군TV — 유튜브 공식 채널 최신 영상(자체 저장 없음, 클릭 시 페이지 안에서 임베드 재생) */}
          {tvNews.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-brand">태안군TV</h2>
              <span className="accent-rule mt-3" aria-hidden />
              <div className="mt-4">
                <TvVideoTheater videos={tvNews} />
              </div>
              <p className="mt-2 text-xs text-foreground-muted">태안군 공식 유튜브 · 클릭 시 이 페이지에서 재생 · <Link href="/news" className="font-semibold text-accent hover:underline">태안뉴스의 태안군TV 탭</Link>에서 더 보기</p>
            </section>
          )}

          {/* 역대 오늘, 태안 — 같은 날짜 과거 주요뉴스 랜덤 */}
          {onThisDay.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-brand">역대 오늘, 태안</h2>
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
              <Link href="/news" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">아카이브 전체 보기 →</Link>
            </section>
          )}

          <MembershipNudge
            source="live"
            title="낙조·물때·수요를 매일 맞춤으로"
            subtitle="관심 지점·업종에 맞춘 아침 브리핑과 우선 알림 — 멤버십으로. 사전 신청자는 첫 달 무료."
          />

          <p className="hairline pt-6 text-center text-xs text-foreground-muted">
            출처 기상청·에어코리아·국립해양조사원·국토교통부·오피넷·태안신문·태안군TV(유튜브) · 무료 공공데이터
          </p>
        </div>
      )}
    </div>
  );
}
