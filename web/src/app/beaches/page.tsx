// 태안 해수욕장 보드 — 해변별 해수욕 적합도 랭킹(수온·파고·해수욕지수·물때).
//   공개 페이지. 데이터: GET /api/conditions/beaches (loadMarine + rankBeaches).
//   실시간 해양 관측/예보 기반 — 태안 관광의 본체인 '해변'을 지점 단위로 보여준다.

import type { Metadata } from "next";

import { getBeaches, getMudflat, getFishing, getSunset, getFog, getFerry, fetchSeafog, type BeachScoreView, type MudflatDayView, type FishingDayView, type FishingGrade } from "@/lib/api/reports";
import { SunsetCard, FogCard, FerryCard } from "@/components/reports/report-charts";
import { PageHeader } from "@/components/page-header";
import { Pill, SecHead, type Tone } from "@/components/editorial";

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



// 2026-10 리디자인(가독성) — /live와 같은 체계. 등급은 '좋음·주의' 같은 글자 알약(색은 보조),
//   주의·위험 칸은 굵은 주황/빨강 테두리. 파스텔 배경·이모지 장식은 고대비에서 글자가 묻혀 뺐다.
const LEVEL_TONE: Record<BeachScoreView["level"], Tone> = { "최고": "good", "좋음": "ok", "보통": "plain", "주의": "warn", "비추천": "bad" };
const FISHING_TONE: Record<FishingGrade, Tone> = { "최적": "good", "좋음": "ok", "보통": "plain", "주의": "warn", "출조자제": "bad" };
/** 주의 → 주황 테두리, 위험 → 빨강 테두리. 그 밖엔 평범한 선. */
const ring = (t: Tone) => (t === "bad" ? "border-2 border-[#B3261E]" : t === "warn" ? "border-2 border-[#9A5B00]" : "border border-ti-line");

export default async function BeachesPage() {
  const [board, mudflat, fishing, sunset, fog, ferry, seafog] = await Promise.all([getBeaches(), getMudflat(), getFishing(), getSunset(), getFog(), getFerry(), fetchSeafog()]);
  const fogQuiet = !!fog && (!fog.worst || fog.worst.score < 40);

  return (
    <div className="space-y-10 text-ti-ink">
      <PageHeader
        eyebrow="해변"
        title="이번 주말, 태안 어느 해변?"
        description="해수욕 적합도 · 가의도 배 시간표 · 낙조 · 갯벌 물때 · 낚시 출조 · 해무 — 태안 바다를 한 화면에 모았습니다."
      />

      {!board ? (
        <p className="rounded-[18px] border border-ti-line bg-ti-surface p-8 text-center text-ti-ink2">
          지금은 해변 데이터를 불러올 수 없습니다. 잠시 뒤 다시 확인해 주세요.
        </p>
      ) : (
        <section aria-labelledby="beach-title">
          <SecHead id="beach-title" title="해수욕 적합도" note="해수욕지수·파고(안전)·수온을 합친 100점 만점 점수입니다." />

          {/* 오늘의 추천 — 쪽에서 가장 먼저 찾는 답이라 남색 판에 크게(홈 '오늘의 바다'와 같은 결). */}
          {board.top && (
            <div className="on-dark mb-5 flex flex-wrap items-end justify-between gap-4 rounded-[20px] bg-ti-navy p-5 text-ti-on-navy md:p-6">
              <div className="min-w-0">
                <p className="font-bold text-ti-on-navy-muted">오늘의 추천 해변</p>
                <h3 className="mt-1 font-head text-[clamp(1.6rem,3.4vw,2.2rem)] font-black">{board.top.name}</h3>
                {board.top.reasons.length > 0 && <p className="mt-1.5 text-ti-on-navy-muted">{board.top.reasons.join(" · ")}</p>}
              </div>
              <div className="text-right">
                <p>
                  <span className="font-display text-[3.2rem] font-semibold leading-none tabular-nums">{board.top.score}</span>
                  <span className="ml-1 text-[1.1rem] text-ti-on-navy-muted">/ 100</span>
                </p>
                <p className="mt-1.5"><Pill tone={LEVEL_TONE[board.top.level]}>{board.top.level}</Pill></p>
              </div>
            </div>
          )}

          <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
            {board.beaches.map((b, i) => (
              <li key={b.name} className={`flex min-w-0 flex-col gap-3 rounded-[18px] bg-ti-surface p-5 ${ring(LEVEL_TONE[b.level])}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[1.15rem] font-bold text-ti-ink">
                    <span className="mr-2 text-ti-muted">{i + 1}위</span>{b.name}
                  </h3>
                  <p className="flex items-center gap-2">
                    <span className="font-display text-[1.9rem] font-semibold leading-none tabular-nums text-ti-ink">{b.score}</span>
                    <span className="sr-only">점,</span>
                    <Pill tone={LEVEL_TONE[b.level]}>{b.level}</Pill>
                  </p>
                </div>
                {/* 실측 해수욕지수가 없는 지점은 수온·파고로 추정한 등급 — 배지만 보면 실측과 구분이 안 되므로 글로 명시. */}
                {b.estimated && <p className="text-[0.9rem] text-ti-ink2">실측 해수욕지수가 없어 수온·파고로 <b className="text-ti-ink">추정</b>한 등급입니다.</p>}
                {(b.beachIndex || b.waterTemp != null || b.waveHeight != null) && (
                  <dl className="m-0 flex flex-wrap gap-2">
                    {b.beachIndex && <Chip label="해수욕지수" value={b.beachIndex} />}
                    {b.waterTemp != null && <Chip label="수온" value={`${Math.round(b.waterTemp)}℃`} />}
                    {b.waveHeight != null && <Chip label="파고" value={`${b.waveHeight.toFixed(1)}m`} />}
                  </dl>
                )}
              </li>
            ))}
          </ol>

          <p className="mt-4 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[0.9rem] text-ti-muted">
            <span>
              {board.tide?.station && <>물때 {board.tide.station} 기준 · </>}
              {board.sun && <>해 뜨는 시각 {board.sun.sunrise} · 해 지는 시각 {board.sun.sunset}</>}
            </span>
            <span>{board.updatedAt ? `${board.updatedAt} 기준` : "실시간"} · 국립해양조사원·기상청</span>
          </p>
          <p className="mt-3 rounded-[14px] border-2 border-[#9A5B00] bg-ti-surface px-4 py-3 text-ti-ink">
            <b>물놀이 전 꼭 확인하세요.</b> 점수는 규칙으로 계산한 참고값입니다. 현장 안전요원 안내와 기상특보를 먼저 따르세요.
          </p>
        </section>
      )}

      {/* 여객선 — 태안 유일 항로(안흥↔가의도). 섬 접근 가능 여부라 해변 정보와 성격이 같아 바다 허브에 둔다. */}
      {ferry && (
        <section aria-labelledby="ferry-sec">
          <SecHead id="ferry-sec" title="가의도 배 시간표 — 안흥항 여객선" />
          <FerryCard ferry={ferry} />
        </section>
      )}

      {sunset && (
        <section aria-labelledby="sunset-sec">
          <SecHead id="sunset-sec" title="오늘의 낙조" />
          <SunsetCard sunset={sunset} />
        </section>
      )}

      {mudflat && mudflat.days.length > 0 && (
        <section aria-labelledby="mudflat-sec">
          <SecHead id="mudflat-sec" title="갯벌 물때 적기" note={`${mudflat.station} 조석 기준`} />

          {mudflat.best && (
            <div className="mb-4 rounded-[18px] border-2 border-ti-petrol bg-ti-surface p-5">
              <p className="flex flex-wrap items-center gap-2 font-bold text-ti-petrol-ink">갯벌 체험 추천일 <Pill tone="good">추천</Pill></p>
              <h3 className="mt-1.5 text-[1.25rem] font-bold text-ti-ink">
                {fmtMd(mudflat.best.date)}({mudflat.best.weekday}) · {mudflat.best.tideLabel}
              </h3>
              <p className="mt-1 text-ti-ink2">
                물이 가장 많이 빠지는 시각{" "}
                <span className="font-display text-[1.6rem] font-semibold tabular-nums text-ti-ink">{mudflat.best.best?.time}</span>
                {mudflat.best.best?.level != null && <> (조위 {mudflat.best.best.level}cm)</>} 전후로 갯벌이 가장 넓게 드러납니다.
              </p>
            </div>
          )}

          <ul className="m-0 grid list-none gap-2.5 p-0 md:grid-cols-5">
            {mudflat.days.map((d: MudflatDayView) => (
              <li key={d.date} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[14px] bg-ti-surface p-3.5 md:block ${d.good ? "border-2 border-ti-petrol" : "border border-ti-line"}`}>
                <p className="font-bold text-ti-ink">{fmtMd(d.date)}<span className="font-normal text-ti-ink2">({d.weekday})</span></p>
                <p className="text-[0.9rem] text-ti-ink2 md:mt-1">{d.tideLabel}{d.range != null && <> · 조차 {d.range}m</>}</p>
                <p className="text-ti-ink2 md:mt-1.5">
                  {d.best ? <>낮 간조 <b className="tabular-nums text-ti-ink">{d.best.time}</b></> : "낮 간조 없음"}
                </p>
                <p className="md:mt-1.5">{d.good ? <Pill tone="good">체험 적기</Pill> : <span className="text-[0.9rem] text-ti-muted">적기 아님</span>}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.95rem] text-ti-ink2">조차가 클수록(사리) 갯벌이 넓게 드러납니다. 물때는 빠르게 바뀌니 현장에서 <b className="text-ti-ink">밀물 시각</b>을 꼭 확인하세요.</p>
        </section>
      )}

      {fishing && fishing.days.length > 0 && (
        <section aria-labelledby="fishing-sec">
          <SecHead
            id="fishing-sec"
            title="낚시 출조 지수"
            note={`배낚시·선상 기준 · ${fishing.spot}${fishing.waterTemp != null ? ` · 수온 ${Math.round(fishing.waterTemp)}℃` : ""}`}
          />

          {fishing.todaySpecies.length > 0 && (
            <p className="mb-4 flex flex-wrap items-center gap-2 text-ti-ink2">
              <b className="text-ti-ink">오늘의 제철 어종</b>
              {fishing.todaySpecies.map((s) => <Pill key={s} tone="plain">{s}</Pill>)}
            </p>
          )}

          {fishing.best && (
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4 rounded-[18px] border-2 border-ti-petrol bg-ti-surface p-5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-bold text-ti-petrol-ink">출조 추천일 <Pill tone="good">추천</Pill></p>
                <h3 className="mt-1.5 text-[1.25rem] font-bold text-ti-ink">{fmtMd(fishing.best.date)}({fishing.best.weekday})</h3>
                {fishing.best.reasons.length > 0 && <p className="mt-1 text-ti-ink2">{fishing.best.reasons.join(" · ")}</p>}
              </div>
              <p>
                <span className="font-display text-[2.6rem] font-semibold leading-none tabular-nums text-ti-ink">{fishing.best.score}</span>
                <span className="ml-1 text-ti-muted">/ 100</span>
              </p>
            </div>
          )}

          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
            {fishing.days.map((d: FishingDayView) => (
              <li key={d.date} className={`min-w-0 rounded-[18px] bg-ti-surface p-4 ${ring(FISHING_TONE[d.grade])}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-ti-ink">{fmtMd(d.date)}<span className="font-normal text-ti-ink2">({d.weekday})</span></h3>
                  <p className="flex items-center gap-2">
                    <span className="font-display text-[1.6rem] font-semibold leading-none tabular-nums text-ti-ink">{d.score}</span>
                    <span className="sr-only">점,</span>
                    <Pill tone={FISHING_TONE[d.grade]}>{d.grade}</Pill>
                  </p>
                </div>
                {(d.waveHeight != null || d.windSpeed != null || d.tideRange != null) && (
                  <dl className="m-0 mt-2.5 flex flex-wrap gap-2">
                    {d.waveHeight != null && <Chip label="파고" value={`${d.waveHeight.toFixed(1)}m`} />}
                    {d.windSpeed != null && <Chip label="바람" value={`${Math.round(d.windSpeed)}m/s`} />}
                    {d.tideRange != null && <Chip label="조차" value={`${d.tideRange.toFixed(1)}m`} />}
                  </dl>
                )}
                {d.highTides.length > 0 && (
                  <p className="mt-2.5 text-[0.9rem] text-ti-ink2">만조 <b className="tabular-nums text-ti-ink">{d.highTides.join(" · ")}</b>{d.lowTides.length > 0 && <> · 간조 <b className="tabular-nums text-ti-ink">{d.lowTides.join(" · ")}</b></>}</p>
                )}
                {d.reasons.length > 0 && <p className="mt-1 text-[0.9rem] text-ti-ink2">{d.reasons.join(" · ")}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-[14px] border-2 border-[#9A5B00] bg-ti-surface px-4 py-3 text-ti-ink">
            <b>출항 전 풍랑특보와 선장 안내를 꼭 확인하세요.</b> 점수는 파고·풍속·물때·수온·제철 어종을 합친 규칙 점수(선상 기준)입니다. 안전이 먼저입니다.
          </p>
        </section>
      )}

      {(fog || seafog?.available) && (
        <section aria-labelledby="fog-sec">
          <SecHead id="fog-sec" title="해안 해무·시정" />
          <div className="space-y-4">
            <FogCard fog={fog} />
            {/* 해무 위험이 낮으면 카드가 숨으므로 '괜찮다'는 답을 글로 남긴다. */}
            {fogQuiet && <p className="flex flex-wrap items-center gap-2 text-ti-ink2"><Pill tone="good">양호</Pill>앞으로 3일은 해무 걱정이 적습니다.</p>}
            {seafog?.available && (
              <div className="grid gap-4 md:grid-cols-2">
                {seafog.stills.map((s) => (
                  <figure key={s.station} className="m-0 overflow-hidden rounded-[18px] border border-ti-line bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.url} alt={`${s.station} 해무 관측 CCTV 화면`} className="aspect-video w-full object-cover" loading="lazy" />
                    <figcaption className="flex flex-wrap items-center justify-between gap-2 bg-ti-surface px-4 py-2.5">
                      <span className="font-semibold text-ti-ink">{s.station}</span>
                      <span className="text-[0.9rem] text-ti-muted">{s.imgDt.slice(5)} 기준</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            <p className="text-[0.85rem] text-ti-muted">국립해양조사원 해무관측소 · 10분 단위 · 태안 인근 서해</p>
          </div>
        </section>
      )}
    </div>
  );
}

// 'YYYY-MM-DD' → '10월 3일' (빗금 날짜는 월/일을 헷갈리기 쉬워 글로)
const fmtMd = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(m)}월 ${Number(d)}일`; };

/** 측정값 한 칸 — 이름은 흐리게, 값은 진하게. dl 안에서 쓴다. */
function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-baseline gap-1.5 rounded-full bg-ti-sunk px-3 py-1">
      <dt className="text-[0.9rem] text-ti-ink2">{label}</dt>
      <dd className="m-0 font-semibold tabular-nums text-ti-ink">{value}</dd>
    </div>
  );
}
