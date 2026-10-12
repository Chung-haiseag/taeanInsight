import type { Metadata } from "next";

import Link from "next/link";

import { fetchReportMetrics, fetchLatestNews, fetchOnThisDay, fetchCctv, fetchTvNews, getDust, getBloom, getFireRisk, getTodayBrief, getFestivals, getWeatherAlert, getLiveConditions, getTenDay } from "@/lib/api/reports";
import {
  AlertStrip, ArticleList, BloomList, DemandCard, DustForecast, Festivals, FireWarning, Glance, SecHead,
} from "@/components/live/live-sections";
import { WeatherHero } from "@/components/live/weather-hero";
import { HourlyChart } from "@/components/live/hourly-chart";
import { AirUvCard, TenDayCard } from "@/components/home/weather-cards";
import { SeaPanel } from "@/components/home/sea-panel";
import { TodayBriefBanner } from "@/components/reports/today-brief-banner";
import { CctvPlayer } from "@/components/reports/cctv-player";
import { TvVideoTheater } from "@/components/tv-video-grid";
import { LiveClock } from "@/components/live-clock";
import { MembershipNudge } from "@/components/membership-nudge";

export const metadata: Metadata = {
  title: "지금 태안",
  description: "태안의 실시간 날씨·대기질·물때·도로 CCTV·관광 수요·행사를 한 화면에. (해변별 상황은 해변, 부동산·시세는 지역경제 페이지)",
  openGraph: { title: "지금 태안 — 실시간 현황", description: "날씨·대기질·바다·물때·관광 수요를 한눈에", type: "website", locale: "ko_KR", siteName: "태안 인사이트" },
};

// 실시간성 위주 — 3분 ISR(metrics 스냅샷 30분·도매 일단위라 60초는 과함, 재생성 부하만 큼)
export const revalidate = 180;

function decodeEntities(s: string): string {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#039;/g, "'");
}

// 2026-10-11 날씨 칸 재정비 — 날씨를 한 블록으로 모았다(평택 인사이트 생활정보 화면을 본보기로).
//   왼쪽(넓은 칸, 그림이 큰 것): 지금 날씨 머리칸 → 시간별 예보 24시간 → 오늘의 바다
//   오른쪽(좁은 칸, 수치 목록): 미세먼지·자외선(지금) → 미세먼지 예보(사흘) → 10일 예보
// ⚠ 칸 배정은 **같은 이야기끼리 + 두 기둥 길이 맞추기**다. 처음엔 바다를 오른쪽에 뒀더니
//   오른쪽이 234px 더 길어 왼쪽 아래가 뻥 비었고(2026-10-11 사용자 지적), 미세먼지가 두 칸에
//   흩어져 있었다. 물때·시간별 그래프는 넓은 칸이라야 읽히고, 미세먼지는 지금·사흘이 붙어야 한다.
//   그 아래는 예전과 같다: 한눈에 → 관광·행사 → 도로 CCTV → [최신 뉴스 | 역대 오늘] → 태안군TV.
// ⚠ 날씨 실측은 /api/conditions/taean(15분)에서 받는다 — metrics 스냅샷(30분 크론)은 외부 API
//   팬아웃에 밀려 대기질이 비는 때가 있었다. 10일·시간별은 /api/conditions/tenday 한 번으로 둘 다 온다.
export default async function LivePage() {
  const [metrics, onThisDay, cctv, news, tvNews, dust, bloom, fireRisk, todayBrief, festivals, weatherAlert, live, ten] = await Promise.all([
    fetchReportMetrics(),
    fetchOnThisDay(8),
    fetchCctv(),
    fetchLatestNews(10),
    fetchTvNews(8),
    getDust(),
    getBloom(),
    getFireRisk(),
    getTodayBrief(),
    getFestivals(),
    getWeatherAlert(),
    getLiveConditions(),
    getTenDay(),
  ]);
  const norm = (s: string) => s.replace(/\s/g, "");
  const festivalCount = new Set([...festivals.map((f) => norm(f.name)), ...(metrics?.tourism.festivals ?? []).map((f) => norm(f.title))]).size;
  const fireHigh = fireRisk?.level === "높음" || fireRisk?.level === "매우높음";
  const days = ten?.days ?? [];
  const hours = ten?.hours ?? [];

  return (
    <div className="mx-auto max-w-[1200px] space-y-10 text-ti-ink">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <p className="text-[0.85rem] font-bold tracking-[0.14em] text-ti-petrol-ink">실시간 · 지금 태안</p>
          <h1 className="mt-1.5 font-head text-[clamp(2rem,4.4vw,3rem)] font-black leading-tight tracking-[-0.025em]">지금 태안</h1>
          <p className="mt-2 max-w-[40em] text-[1.08rem] text-ti-ink2">날씨·대기·물때·관광 수요·행사·도로 상황을 한 화면에 모았습니다.</p>
        </div>
        <LiveClock />
      </header>

      <AlertStrip alert={weatherAlert} />
      <TodayBriefBanner brief={todayBrief} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />

      {!metrics ? (
        <p className="rounded-[18px] border border-ti-line bg-ti-surface p-8 text-center text-ti-ink2">
          실시간 데이터를 불러오지 못했습니다. 잠시 뒤 다시 확인해 주세요.
        </p>
      ) : (
        <>
          {/* ── 날씨 한 블록 — 지금·시간별·예보·대기·바다 ── */}
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-5">
              <WeatherHero live={live} today={days[0] ?? null} tomorrow={days[1] ?? null} hours={hours} />
              <HourlyChart hours={hours} />
              <SeaPanel metrics={metrics} fog={null} loaded wide />
            </div>
            <div className="flex flex-col gap-5 self-start">
              <AirUvCard live={live} dust={dust} detailed />
              <DustForecast dust={dust} compact />
              <TenDayCard ten={ten} />
            </div>
          </div>

          {fireHigh && <FireWarning fire={fireRisk} />}

          <Glance metrics={metrics} fire={fireRisk} festivalCount={festivalCount} />

          <section aria-labelledby="tour-title">
            <SecHead id="tour-title" title="관광·행사" link={{ href: "/beaches", label: "해변별 상황 보기" }} />
            <div className="grid items-start gap-5 lg:grid-cols-2">
              <DemandCard demand={metrics.tourism.demand} />
              <div className="grid gap-5">
                <Festivals festivals={festivals} tour={metrics.tourism} />
                <BloomList bloom={bloom} />
              </div>
            </div>
          </section>

          {cctv.available && cctv.cameras.length > 0 && (
            <section aria-labelledby="cctv-title">
              <SecHead id="cctv-title" title="도로 실시간 CCTV" note="소리 없는 도로 실시간 화면입니다. 아래에서 지점을 고르세요." />
              <CctvPlayer cameras={cctv.cameras} updatedAt={cctv.updatedAt} />
            </section>
          )}

          <div className="grid gap-10 lg:grid-cols-2">
            <ArticleList
              id="news-title"
              title="최신 태안 뉴스"
              items={news.slice(0, 10).map((n) => ({ key: n.idxno, href: `/news/${n.idxno}`, meta: `${Number(n.publishedAt.slice(5, 7))}월 ${Number(n.publishedAt.slice(8, 10))}일`, title: decodeEntities(n.title) }))}
              more={{ href: "/news", label: "태안 뉴스 전체 보기" }}
            />
            <ArticleList
              id="otd-title"
              title="역대 오늘, 태안"
              note="같은 날짜의 옛 기사 — 새로고침할 때마다 바뀝니다."
              items={onThisDay.map((a) => ({ key: a.idxno, href: `/news/${a.idxno}`, meta: `${a.year}년`, title: decodeEntities(a.title) }))}
              more={{ href: "/news", label: "아카이브 전체 보기" }}
            />
          </div>

          {tvNews.length > 0 && (
            <section aria-labelledby="tv-title">
              <SecHead id="tv-title" title="태안군TV" note="태안군 공식 유튜브 — 누르면 이 페이지에서 재생됩니다." />
              <TvVideoTheater videos={tvNews} />
            </section>
          )}

          <MembershipNudge
            source="live"
            title="이번 주말 손님, 미리 알고 준비하세요"
            subtitle="월 9,900원 멤버십 — 주간 인사이트 리포트 전문과 업종별 사장님 보드가 열립니다."
          />

          <p className="border-t border-ti-line pt-5 text-center text-[0.9rem] text-ti-muted">
            출처: 기상청·에어코리아·국립해양조사원·국가교통정보센터·한국관광공사·태안신문·태안군TV(유튜브) — 모두 무료 공공데이터 ·{" "}
            <Link href="/reports#data" className="font-semibold text-ti-petrol-ink underline underline-offset-4">기간별 추세·CSV 내려받기</Link>
          </p>
        </>
      )}
    </div>
  );
}
