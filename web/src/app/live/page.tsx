import type { Metadata } from "next";

import { fetchReportMetrics } from "@/lib/api/reports";
import {
  SummaryInfographic, WeatherCards, AirQualityTrend, MarineCard,
  DemandGauge, FestivalList, SeasonalFoodCard, OilCard,
} from "@/components/reports/report-charts";

export const metadata: Metadata = {
  title: "지금 태안",
  description: "태안의 실시간 날씨·대기질·바다(수온·파고·물때)·자외선·관광 수요를 한 화면에.",
  openGraph: { title: "지금 태안 — 실시간 현황", description: "날씨·대기질·바다·물때·관광 수요를 한눈에", type: "website", locale: "ko_KR", siteName: "태안 AI 인텔리전스" },
};

// 실시간성 위주 — 1분 ISR(metrics는 백엔드 스냅샷이 30분 주기로 신선)
export const revalidate = 60;

export default async function LivePage() {
  const metrics = await fetchReportMetrics();

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

          <p className="hairline pt-6 text-center text-xs text-foreground-muted">
            출처 기상청·에어코리아·국립해양조사원·국토교통부·오피넷 · 무료 공공데이터
          </p>
        </div>
      )}
    </div>
  );
}
