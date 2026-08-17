// 태안 해수욕장 보드 — 해변별 해수욕 적합도 랭킹(수온·파고·해수욕지수·물때).
//   공개 페이지. 데이터: GET /api/conditions/beaches (loadMarine + rankBeaches).
//   실시간 해양 관측/예보 기반 — 태안 관광의 본체인 '해변'을 지점 단위로 보여준다.

import type { Metadata } from "next";

import { getBeaches, getMudflat, getFishing, getSunset, getFog, getFerry, fetchSeafog, type BeachScoreView, type MudflatDayView, type FishingDayView, type FishingGrade } from "@/lib/api/reports";
import { SunsetCard, FogCard, FerryCard } from "@/components/reports/report-charts";
import { PageHeader } from "@/components/page-header";

// 검색 유입 핵심 페이지 — '태안 해수욕장 수온'·'안면도 낙조 시간'·'태안 물때'·'가의도 배시간' 같은
// 지역 롱테일 질의를 받는다. (제목 템플릿 '%s | 태안 인사이트'가 붙으므로 여기선 키워드만.)
//   ※ 제목은 검색량이 큰 해수욕장·물때·낙조를 지키고, 뱃길은 설명문과 본문 제목(h2)으로 신호를 준다.
//     '가의도 배시간'은 경쟁이 거의 없는 롱테일이라 정확한 문구가 본문에 있으면 충분히 잡힌다.
export const metadata: Metadata = {
  title: "태안 해수욕장·물때·낙조",
  description: "태안 해수욕장별 해수욕 적합도(수온·파고)와 갯벌 물때, 낚시 출조 지수, 오늘의 낙조 시각, 해안 해무, 그리고 가의도 배 시간표(안흥항 여객선 운항 현황)까지 — 태안 바다를 한 화면에.",
  openGraph: {
    title: "태안 해수욕장·물때·낙조 — 오늘 바다는 어떤가",
    description: "해수욕 적합도·갯벌 물때·낚시·낙조·해무 + 가의도 배 시간표를 실시간 관측으로",
    type: "website", locale: "ko_KR", siteName: "태안 인사이트",
  },
};

export const revalidate = 900;

const FISHING_STYLE: Record<FishingGrade, { ring: string; badge: string }> = {
  "최적": { ring: "border-accent bg-accent-subtle/25", badge: "bg-accent text-background" },
  "좋음": { ring: "border-brand/20 bg-background", badge: "bg-brand text-background" },
  "보통": { ring: "border-brand/15 bg-background", badge: "bg-brand/70 text-background" },
  "주의": { ring: "border-amber-300 bg-amber-50", badge: "bg-amber-500 text-background" },
  "출조자제": { ring: "border-red-200 bg-red-50", badge: "bg-red-500 text-background" },
};

const LEVEL_STYLE: Record<BeachScoreView["level"], { ring: string; badge: string; dot: string }> = {
  "최고": { ring: "border-accent bg-accent-subtle/25", badge: "bg-accent text-background", dot: "🟢" },
  "좋음": { ring: "border-brand/20 bg-background", badge: "bg-brand text-background", dot: "🟢" },
  "보통": { ring: "border-brand/15 bg-background", badge: "bg-brand/70 text-background", dot: "🟡" },
  "주의": { ring: "border-amber-300 bg-amber-50", badge: "bg-amber-500 text-background", dot: "🟠" },
  "비추천": { ring: "border-red-200 bg-red-50", badge: "bg-red-500 text-background", dot: "🔴" },
};

export default async function BeachesPage() {
  const [board, mudflat, fishing, sunset, fog, ferry, seafog] = await Promise.all([getBeaches(), getMudflat(), getFishing(), getSunset(), getFog(), getFerry(), fetchSeafog()]);

  return (
    <div className="mx-auto max-w-[1000px] space-y-8">
      <PageHeader
        align="center"
        eyebrow="BEACH BOARD"
        title="이번 주말, 태안 어느 해변?"
        description={<><strong className="text-brand">해수욕 적합도</strong> · <strong className="text-brand">낙조</strong> · <strong className="text-brand">갯벌 물때</strong> · <strong className="text-brand">낚시 출조</strong> · <strong className="text-brand">해무</strong> · <strong className="text-brand">가의도 배 시간표</strong> — 태안 바다·해변을 한 화면에.</>}
      />

      {!board ? (
        <p className="rounded-2xl border border-brand/15 bg-background p-8 text-center text-sm text-foreground-muted shadow-card">
          지금은 해변 데이터를 불러올 수 없습니다. 잠시 후 다시 확인해 주세요.
        </p>
      ) : (
        <>
          {board.top && (
            <section className={`rounded-2xl border-2 p-6 shadow-card ${LEVEL_STYLE[board.top.level].ring}`}>
              <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-accent">오늘의 추천 해변</p>
              <div className="mt-2 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-extrabold text-brand">🏖️ {board.top.name}</h2>
                  <p className="mt-1 text-sm text-foreground-muted">{board.top.reasons.join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="text-5xl font-extrabold leading-none text-brand">{board.top.score}<span className="text-xl font-bold text-foreground-muted">/100</span></p>
                  <span className={`mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-bold ${LEVEL_STYLE[board.top.level].badge}`}>{board.top.level}</span>
                </div>
              </div>
            </section>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            {board.beaches.map((b, i) => (
              <article key={b.name} className={`flex flex-col gap-3 rounded-2xl border p-5 shadow-card ${LEVEL_STYLE[b.level].ring}`}>
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-lg font-bold text-brand">
                    <span className="text-sm text-foreground-muted">{i + 1}위</span>{b.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-extrabold text-brand">{b.score}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-bold ${LEVEL_STYLE[b.level].badge}`}>{b.level}</span>
                    {/* 실측 해수욕지수가 없는 지점은 수온·파고로 추정한 등급 — 배지만 보면 실측과 구분이 안 되므로 명시. */}
                    {b.estimated && <span className="rounded-full border border-brand/20 px-1.5 py-0.5 text-[0.625rem] font-semibold text-foreground-muted" title="실측 해수욕지수가 없어 수온·파고로 추정한 등급">추정</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {b.beachIndex && <Chip label="해수욕지수" value={b.beachIndex} />}
                  {b.waterTemp != null && <Chip label="수온" value={`${Math.round(b.waterTemp)}℃`} />}
                  {b.waveHeight != null && <Chip label="파고" value={`${b.waveHeight.toFixed(1)}m`} />}
                </div>
              </article>
            ))}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-muted">
            <span>
              {board.tide?.station && <>물때: {board.tide.station} 기준 · </>}
              {board.sun && <>일출 {board.sun.sunrise} · 일몰 {board.sun.sunset}</>}
            </span>
            <span>{board.updatedAt ? `기준 ${board.updatedAt}` : "실시간"} · 국립해양조사원·기상청</span>
          </div>

          <p className="rounded-xl border border-brand/10 bg-accent-subtle/15 px-4 py-3 text-center text-xs text-foreground-muted">
            적합도는 <strong className="text-brand">해수욕지수·파고(안전)·수온</strong>을 종합한 규칙 점수입니다. 물놀이 전 현장 안전정보·기상특보를 반드시 확인하세요.
          </p>
        </>
      )}

      {/* 여객선 — 태안 유일 항로(안흥↔가의도). 섬 접근 가능 여부라 해변 정보와 성격이 같아 바다 허브에 둔다. */}
      {ferry && (
        <section>
          <h2 className="text-xl font-bold text-brand">⛴ 가의도 배 시간표 — 안흥항 여객선</h2>
          <span className="accent-rule mt-3" aria-hidden />
          <FerryCard ferry={ferry} />
        </section>
      )}

      {sunset && (
        <section className="space-y-4 pt-2">
          <h2 className="text-xl font-bold text-brand">🌅 오늘의 낙조</h2>
          <span className="accent-rule mt-1" aria-hidden />
          <SunsetCard sunset={sunset} />
        </section>
      )}

      {mudflat && mudflat.days.length > 0 && (
        <section className="space-y-4 pt-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-brand">🦪 갯벌 물때 적기</h2>
            <span className="text-xs text-foreground-muted">{mudflat.station} 조석 기준</span>
          </div>

          {mudflat.best && (
            <div className="rounded-2xl border-2 border-accent bg-accent-subtle/25 p-5 shadow-card">
              <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-accent">갯벌 체험 추천</p>
              <p className="mt-1 text-lg font-bold text-brand">
                {fmtMd(mudflat.best.date)}({mudflat.best.weekday}) · {mudflat.best.tideLabel}
              </p>
              <p className="mt-0.5 text-sm text-foreground-muted">
                최적 간조 <strong className="text-brand">{mudflat.best.best?.time}</strong>
                {mudflat.best.best?.level != null && <> (조위 {mudflat.best.best.level}cm)</>} 전후로 갯벌이 가장 많이 드러납니다.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {mudflat.days.map((d: MudflatDayView) => (
              <div key={d.date} className={`rounded-xl border p-3 text-center ${d.good ? "border-accent/40 bg-accent-subtle/10" : "border-brand/12 bg-background"}`}>
                <p className="text-sm font-bold text-brand">{fmtMd(d.date)}<span className="text-foreground-muted">({d.weekday})</span></p>
                <p className="mt-1 text-[0.6875rem] text-foreground-muted">{d.tideLabel}{d.range != null && <> · {d.range}m</>}</p>
                <p className="mt-1.5 text-xs">
                  {d.best ? <>낮 간조<br /><strong className="text-brand">{d.best.time}</strong></> : <span className="text-foreground-muted">낮 간조 없음</span>}
                </p>
                <p className="mt-1 text-[0.6875rem]">{d.good ? <span className="text-accent font-semibold">✅ 적기</span> : <span className="text-foreground-muted">—</span>}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-foreground-muted">조차가 클수록(사리) 갯벌이 많이 드러납니다. 물때는 빠르게 바뀌니 현장에서 밀물 시각을 꼭 확인하세요.</p>
        </section>
      )}

      {fishing && fishing.days.length > 0 && (
        <section className="space-y-4 pt-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-brand">🎣 낚시 출조 지수 <span className="text-sm font-medium text-foreground-muted">배낚시·선상</span></h2>
            <span className="text-xs text-foreground-muted">{fishing.spot}{fishing.waterTemp != null && <> · 수온 {Math.round(fishing.waterTemp)}℃</>}</span>
          </div>

          {fishing.todaySpecies.length > 0 && (
            <p className="text-sm text-foreground-muted">오늘의 제철 어종: {fishing.todaySpecies.map((s) => <span key={s} className="mr-1.5 inline-block rounded-full bg-brand/5 px-2 py-0.5 text-xs font-semibold text-brand">{s}</span>)}</p>
          )}

          {fishing.best && (
            <div className="rounded-2xl border-2 border-accent bg-accent-subtle/25 p-5 shadow-card">
              <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-accent">출조 추천일</p>
              <div className="mt-1 flex items-end justify-between gap-4">
                <p className="text-lg font-bold text-brand">{fmtMd(fishing.best.date)}({fishing.best.weekday}) · {fishing.best.reasons.join(" · ")}</p>
                <p className="text-right text-3xl font-extrabold leading-none text-brand">{fishing.best.score}<span className="text-base font-bold text-foreground-muted">/100</span></p>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {fishing.days.map((d: FishingDayView) => (
              <div key={d.date} className={`rounded-2xl border p-4 shadow-card ${FISHING_STYLE[d.grade].ring}`}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-brand">{fmtMd(d.date)}<span className="text-foreground-muted">({d.weekday})</span></p>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-extrabold text-brand">{d.score}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${FISHING_STYLE[d.grade].badge}`}>{d.grade}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {d.waveHeight != null && <Chip label="파고" value={`${d.waveHeight.toFixed(1)}m`} />}
                  {d.windSpeed != null && <Chip label="바람" value={`${Math.round(d.windSpeed)}m/s`} />}
                  {d.tideRange != null && <Chip label="조차" value={`${d.tideRange.toFixed(1)}m`} />}
                </div>
                {d.highTides.length > 0 && (
                  <p className="mt-2 text-[0.6875rem] text-foreground-muted">만조 {d.highTides.join(" · ")}{d.lowTides.length > 0 && <> · 간조 {d.lowTides.join(" · ")}</>}</p>
                )}
                {d.reasons.length > 0 && <p className="mt-1 text-[0.6875rem] text-foreground-muted">{d.reasons.join(" · ")}</p>}
              </div>
            ))}
          </div>
          <p className="rounded-xl border border-brand/10 bg-accent-subtle/15 px-4 py-3 text-center text-xs text-foreground-muted">
            파고·풍속·물때·수온·제철어종을 종합한 규칙 점수(선상 기준)입니다. <strong className="text-brand">출항 전 풍랑특보·선장 안내</strong>를 반드시 확인하세요. 안전이 최우선입니다.
          </p>
        </section>
      )}

      {(fog || seafog?.available) && (
        <section className="space-y-4 pt-2">
          <h2 className="text-xl font-bold text-brand">🌫️ 해안 해무·시정</h2>
          <span className="accent-rule mt-1" aria-hidden />
          <FogCard fog={fog} />
          {seafog?.available && (
            <div className="grid gap-4 sm:grid-cols-2">
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
          )}
          <p className="text-xs text-foreground-muted">국립해양조사원 해무관측소 · 10분 단위 · 태안 인근 서해</p>
        </section>
      )}
    </div>
  );
}

const fmtMd = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(m)}/${Number(d)}`; };

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand/15 bg-brand/5 px-2.5 py-1 text-xs">
      <span className="text-foreground-muted">{label}</span>
      <span className="font-semibold text-brand">{value}</span>
    </span>
  );
}
