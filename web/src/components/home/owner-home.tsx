"use client";

// 사장님 맞춤 홈 — 가게 프로필(업종·읍면) + 실데이터(수요지수·날씨·물때·상권)로
// 매출 결정에 직결되는 예측·실행 제안. 미리보기(blurred)는 정적 샘플, 구독자는 실데이터.

import { useEffect, useState } from "react";
import Link from "next/link";

import { PushOptInButton } from "@/components/me/push_opt_in";
import { DemandGauge } from "@/components/reports/report-charts";
import { REGION_OPTIONS } from "@/lib/types";
import {
  fetchOwnerBrief, updateShopProfile, INDUSTRY_OPTIONS, type LodgingBoard, type NearbyLodging, type FoodBoard, type LeisureBoard, type RetailBoard,
  type FishingBoard, type SaltBoard, type FarmingBoard, type TravelBoard,
  type OwnerBrief, type ShopIndustry,
} from "@/lib/api/owner";

export function OwnerHome({ blurred = false }: { blurred?: boolean }) {
  return (
    <div className={blurred ? "select-none pointer-events-none" : ""} aria-hidden={blurred}>
      {blurred ? <OwnerSample /> : <OwnerLive />}
    </div>
  );
}

// ── 실데이터 버전 ──
function OwnerLive() {
  const [brief, setBrief] = useState<OwnerBrief | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setBrief(await fetchOwnerBrief()); } catch { /* 무시 */ } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  if (loading) return <p className="py-10 text-center text-sm text-foreground-muted">맞춤 브리핑을 불러오는 중…</p>;
  if (!brief) return <p className="py-10 text-center text-sm text-foreground-muted">브리핑을 불러오지 못했습니다.</p>;

  const industryLabel = INDUSTRY_OPTIONS.find((i) => i.value === brief.industry)?.label;

  return (
    <div className="space-y-12">
      <section className="pt-2">
        <p className="eyebrow"><span className="inline-block w-6 h-px bg-accent" aria-hidden /> 사장님 맞춤 브리핑</p>
        <h1 className="mt-4 text-display-sm font-bold text-brand">안녕하세요, 사장님 👋</h1>
        {brief.hasShop ? (
          <p className="mt-2 text-foreground-muted">
            {industryLabel} · {brief.demand?.headline ?? "이번 주말 수요를 확인하세요."}
          </p>
        ) : (
          <p className="mt-2 text-foreground-muted">가게 정보를 설정하면 업종·지역에 맞춘 실행 제안을 받아요.</p>
        )}
      </section>

      {!brief.hasShop && <ShopSetup onSaved={load} />}

      {/* 숙박 운영 보드 — 예상 가동률·권장가·매출 */}
      {brief.lodging && <LodgingBoardCard board={brief.lodging} nearby={brief.market.nearbyLodging} />}

      {/* 식당 운영 보드 — 예상 혼잡도·손님·매출 */}
      {brief.food && <FoodBoardCard board={brief.food} />}

      {/* 레저 운영 보드 — 적합도·참가자·매출 */}
      {brief.leisure && <LeisureBoardCard board={brief.leisure} />}

      {/* 소매 운영 보드 — 혼잡도·방문·매출 */}
      {brief.retail && <RetailBoardCard board={brief.retail} />}

      {/* 낚시·수산 / 염전 / 농업 보드 */}
      {brief.fishing && <FishingBoardCard board={brief.fishing} />}
      {brief.salt && <SaltBoardCard board={brief.salt} />}
      {brief.farming && <FarmingBoardCard board={brief.farming} />}
      {brief.travel && <TravelBoardCard board={brief.travel} />}

      {/* 이번 주말 수요 — 실제 수요지수 */}
      {brief.demand?.available && (
        <section aria-labelledby="weekend-heading">
          <h2 id="weekend-heading" className="text-xl font-bold text-brand">이번 주말 수요 예측</h2>
          <DemandGauge demand={brief.demand} />
        </section>
      )}

      {/* 오늘의 실행 제안 */}
      <section aria-labelledby="action-heading">
        <p className="eyebrow">Action</p>
        <h2 id="action-heading" className="mt-2 text-xl font-bold text-brand">오늘의 실행 제안</h2>
        {brief.actions.length > 0 ? (
          <div className="mt-4 space-y-2.5">
            {brief.actions.map((a, i) => (
              <article key={i} className="card-lift flex gap-4 rounded-2xl border border-accent/30 bg-accent-subtle/20 p-5">
                <span className="text-2xl" aria-hidden>{a.icon}</span>
                <div>
                  <p className="font-semibold text-brand">
                    {a.text}
                    {a.tag && <span className={`ml-2 align-middle rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${a.tag === "안전" ? "bg-red-100 text-red-700" : a.tag === "매출" ? "bg-accent/20 text-accent" : "bg-brand/10 text-brand"}`}>{a.tag}</span>}
                  </p>
                  <p className="mt-1 text-sm text-foreground-muted">{a.why}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-foreground-muted">
            {brief.hasShop ? "오늘은 특별한 액션이 없어요. 평소대로 운영하세요." : "가게 업종을 설정하면 맞춤 제안이 나타납니다."}
          </p>
        )}
      </section>

      {/* 오늘 바다·날씨 */}
      <section aria-labelledby="cond-heading">
        <h2 id="cond-heading" className="text-xl font-bold text-brand">오늘 태안 현황</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {brief.weather?.temp != null && <Stat label="기온" value={`${brief.weather.temp}℃`} sub={brief.weather.sky ?? undefined} />}
          {brief.weather?.grade && <Stat label="대기질" value={brief.weather.grade} sub={`PM10 ${brief.weather.pm10 ?? "—"}`} />}
          {brief.uv?.todayMax != null && <Stat label="자외선" value={brief.uv.level} sub={`지수 ${brief.uv.todayMax}`} />}
          {brief.tide && brief.tide.events[0] && <Stat label="다음 물때" value={nextTide(brief.tide.events)} sub={`${brief.tide.station} 기준`} />}
        </div>
      </section>

      {/* 내 지역 경보·알림 */}
      <section aria-labelledby="alert-heading">
        <h2 id="alert-heading" className="text-xl font-bold text-brand">내 지역 경보·알림</h2>
        <p className="mt-1 text-sm text-foreground-muted">적조·특보·자외선·높은 파고를 영업 영향까지 짚어 알려드려요.</p>
        <div className="mt-4"><PushOptInButton /></div>
      </section>

      {/* 상권 스냅샷 */}
      <section aria-labelledby="market-heading">
        <h2 id="market-heading" className="text-xl font-bold text-brand">주변 상권 스냅샷</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {brief.market.aptAvgManwon != null && <Stat label="아파트 평균가(태안)" value={wonFmt(brief.market.aptAvgManwon)} sub="국토부 실거래" />}
          {brief.market.gasoline != null && <Stat label="충남 휘발유" value={`${brief.market.gasoline.toLocaleString()}원`} sub="오피넷" />}
          {brief.market.festivals[0] && <Stat label={brief.market.festivals[0].title.slice(0, 14)} value={`D-${brief.market.festivals[0].dday}`} sub="인근 축제" />}
        </div>
      </section>
    </div>
  );
}

function nextTide(events: { time: string; type: "고조" | "저조"; level: number | null }[]): string {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  const e = events.find((x) => x.time > hhmm) ?? events[0];
  return `${e.type === "고조" ? "만조" : "간조"} ${e.time}`;
}
function wonFmt(manwon: number): string {
  return manwon >= 10000 ? `${(manwon / 10000).toFixed(1)}억` : `${manwon.toLocaleString()}만원`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <article className="rounded-2xl border border-brand/12 bg-background p-5 shadow-card">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-brand">{value}</p>
      {sub && <p className="mt-1 text-xs text-accent">{sub}</p>}
    </article>
  );
}

// ── 숙박 운영 보드 ── (내 페이지에서도 재사용)
export function LodgingBoardCard({ board, nearby }: { board: LodgingBoard; nearby?: NearbyLodging | null }) {
  const won = (n: number | null) => (n == null ? "—" : `${n.toLocaleString()}원`);
  const occColor = board.occRate >= 75 ? "text-accent" : board.occRate >= 45 ? "text-brand" : "text-amber-600";
  return (
    <section className="rounded-2xl border-2 border-accent/40 bg-accent-subtle/20 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand">🛏 모텔 운영 보드</h2>
        <span className="text-xs text-foreground-muted">{board.weekend.sat.slice(5)}~{board.weekend.sun.slice(5)} 주말 · 수요 ‘{board.level}’</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 가동률</p>
          <p className={`mt-1 font-display text-3xl font-bold ${occColor}`}>{board.occRate}%</p>
          {board.rooms != null && <p className="text-[11px] text-foreground-muted">객실 {board.rooms}실 기준</p>}
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">권장 주말 요금</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.recommendedPrice != null ? `${(board.recommendedPrice / 10000).toFixed(1)}만` : "—"}</p>
          <p className="text-[11px] text-accent">{board.priceMultiplier !== 1 ? `기본가 ${board.priceMultiplier > 1 ? "+" : ""}${Math.round((board.priceMultiplier - 1) * 100)}%` : "기본가 유지"}</p>
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 1박 매출</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.estRevenue != null ? `${Math.round(board.estRevenue / 10000)}만` : "—"}</p>
          <p className="text-[11px] text-foreground-muted">{board.estRevenue != null ? "가동률×권장가" : "객실수·요금 입력 시"}</p>
        </article>
      </div>
      {board.notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {board.notes.map((n, i) => <li key={i} className="text-sm text-foreground">· {n}</li>)}
        </ul>
      )}
      {board.recommendedPrice == null && (
        <p className="mt-3 text-xs text-foreground-muted">💡 가게 정보에 <strong className="text-brand">객실 수·주말 기본가</strong>를 입력하면 권장가·예상 매출이 계산됩니다.</p>
      )}

      {/* 주변 숙박 수 + 실시간 요금 확인(외부) */}
      {nearby && (
        <div className="mt-4 rounded-xl border border-brand/10 bg-background p-3">
          <p className="text-sm">
            <span className="font-semibold text-brand">🏨 주변 숙박업소</span>{" "}
            태안 <strong className="text-brand">{nearby.total}곳</strong>
            {nearby.eupLabel && nearby.nearbyEup != null && <> · {nearby.eupLabel} {nearby.nearbyEup}곳</>}
            <span className="text-foreground-muted"> (한국관광공사 등록 기준)</span>
          </p>
          <p className="mt-1.5 text-xs text-foreground-muted">
            실시간 경쟁 요금은 →{" "}
            <a href="https://www.yanolja.com/search/태안" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">야놀자</a>{" · "}
            <a href="https://www.goodchoice.kr/product/search/태안" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">여기어때</a>{" · "}
            <a href="https://map.naver.com/p/search/태안%20모텔" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">네이버지도</a>
          </p>
        </div>
      )}
      <p className="mt-2 text-[11px] text-foreground-muted">※ 태안 관광 수요예측 기반 추정치 — 실제 예약은 채널·이벤트에 따라 달라집니다.</p>
    </section>
  );
}

// ── 식당 운영 보드 ── (내 페이지에서도 재사용)
export function FoodBoardCard({ board }: { board: FoodBoard }) {
  const busyColor = board.level.includes("높") ? "text-accent" : board.level.includes("낮") ? "text-amber-600" : "text-brand";
  return (
    <section className="rounded-2xl border-2 border-accent/40 bg-accent-subtle/20 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand">{board.kind === "cafe" ? "🍰 카페 운영 보드" : "🍽 식당 운영 보드"}</h2>
        <span className="text-xs text-foreground-muted">{board.weekend.sat.slice(5)}~{board.weekend.sun.slice(5)} 주말 · 수요 ‘{board.level}’</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 혼잡도</p>
          <p className={`mt-1 font-display text-2xl font-bold ${busyColor}`}>{board.busyLabel}</p>
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 손님(일)</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.expectedCovers != null ? `${board.expectedCovers}명` : "—"}</p>
          {board.seats != null && <p className="text-[11px] text-foreground-muted">좌석 {board.seats}석 기준</p>}
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 매출(일)</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.estRevenue != null ? `${Math.round(board.estRevenue / 10000)}만` : "—"}</p>
          <p className="text-[11px] text-foreground-muted">{board.estRevenue != null ? "손님×객단가" : "좌석·객단가 입력 시"}</p>
        </article>
      </div>
      {board.notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {board.notes.map((n, i) => <li key={i} className="text-sm text-foreground">· {n}</li>)}
        </ul>
      )}
      {board.expectedCovers == null && (
        <p className="mt-3 text-xs text-foreground-muted">💡 가게 정보에 <strong className="text-brand">좌석 수·객단가</strong>를 입력하면 예상 손님·매출이 계산됩니다.</p>
      )}
      <p className="mt-2 text-[11px] text-foreground-muted">※ 태안 관광 수요예측 기반 추정치 — 위치·메뉴·단골에 따라 차이가 큽니다.</p>
    </section>
  );
}

// ── 레저·체험 운영 보드 ── (내 페이지에서도 재사용)
export function LeisureBoardCard({ board }: { board: LeisureBoard }) {
  const fitColor = board.fitLabel.startsWith("주의") ? "text-red-600" : board.fitLabel === "좋음" ? "text-accent" : "text-brand";
  return (
    <section className="rounded-2xl border-2 border-accent/40 bg-accent-subtle/20 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand">🏄 레저·체험 운영 보드</h2>
        <span className="text-xs text-foreground-muted">{board.weekend.sat.slice(5)}~{board.weekend.sun.slice(5)} 주말 · 수요 ‘{board.level}’</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">야외 활동 적합도</p>
          <p className={`mt-1 font-display text-2xl font-bold ${fitColor}`}>{board.fitLabel}</p>
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 참가자(일)</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.expectedGuests != null ? `${board.expectedGuests}명` : "—"}</p>
          {board.capacity != null && <p className="text-[11px] text-foreground-muted">정원 {board.capacity}명 기준</p>}
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 매출(일)</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.estRevenue != null ? `${Math.round(board.estRevenue / 10000)}만` : "—"}</p>
          <p className="text-[11px] text-foreground-muted">{board.estRevenue != null ? "참가자×체험료" : "정원·체험료 입력 시"}</p>
        </article>
      </div>
      {board.notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {board.notes.map((n, i) => <li key={i} className="text-sm text-foreground">· {n}</li>)}
        </ul>
      )}
      {board.expectedGuests == null && (
        <p className="mt-3 text-xs text-foreground-muted">💡 가게 정보에 <strong className="text-brand">정원·체험료</strong>를 입력하면 예상 참가자·매출이 계산됩니다.</p>
      )}
      <p className="mt-2 text-[11px] text-foreground-muted">※ 태안 관광 수요·날씨·파고 기반 추정치 — 야외 활동은 기상에 크게 좌우됩니다.</p>
    </section>
  );
}

// ── 소매·상점 운영 보드 ── (내 페이지에서도 재사용)
export function RetailBoardCard({ board }: { board: RetailBoard }) {
  const busyColor = board.level.includes("높") ? "text-accent" : board.level.includes("낮") ? "text-amber-600" : "text-brand";
  return (
    <section className="rounded-2xl border-2 border-accent/40 bg-accent-subtle/20 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand">🛍 소매 운영 보드</h2>
        <span className="text-xs text-foreground-muted">{board.weekend.sat.slice(5)}~{board.weekend.sun.slice(5)} 주말 · 수요 ‘{board.level}’</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 혼잡도</p>
          <p className={`mt-1 font-display text-2xl font-bold ${busyColor}`}>{board.busyLabel}</p>
          <p className="text-[11px] text-foreground-muted">평일 대비 ×{board.multiplier}</p>
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 방문(일)</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.expectedVisitors != null ? `${board.expectedVisitors}명` : "—"}</p>
          {board.baselineVisitors != null && <p className="text-[11px] text-foreground-muted">평일 {board.baselineVisitors}명 기준</p>}
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 매출(일)</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.estRevenue != null ? `${Math.round(board.estRevenue / 10000)}만` : "—"}</p>
          <p className="text-[11px] text-foreground-muted">{board.estRevenue != null ? "방문×객단가" : "방문객·객단가 입력 시"}</p>
        </article>
      </div>
      {board.notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {board.notes.map((n, i) => <li key={i} className="text-sm text-foreground">· {n}</li>)}
        </ul>
      )}
      {board.expectedVisitors == null && (
        <p className="mt-3 text-xs text-foreground-muted">💡 가게 정보에 <strong className="text-brand">평일 평균 방문객·객단가</strong>를 입력하면 예상 방문·매출이 계산됩니다.</p>
      )}
      <p className="mt-2 text-[11px] text-foreground-muted">※ 태안 관광 수요예측 기반 추정치 — 입지·업태에 따라 차이가 큽니다.</p>
    </section>
  );
}

// ── 낚시·수산 운영 보드 ──
export function FishingBoardCard({ board }: { board: FishingBoard }) {
  const goColor = board.goLabel === "위험" ? "text-red-600" : board.goLabel === "주의" ? "text-amber-600" : "text-accent";
  return (
    <section className="rounded-2xl border-2 border-accent/40 bg-accent-subtle/20 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand">🎣 낚시·수산 운영 보드</h2>
        <span className="text-xs text-foreground-muted">오늘 출항 판단 · 수요 ‘{board.level}’</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">출항 가부</p>
          <p className={`mt-1 font-display text-3xl font-bold ${goColor}`}>{board.goLabel}</p>
          <p className="text-[11px] text-foreground-muted">파고 {board.waveHeight?.toFixed(1) ?? "—"}m · 풍속 {board.windSpeed?.toFixed(0) ?? "—"}m/s</p>
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">다음 물때</p>
          <p className="mt-1 font-display text-2xl font-bold text-brand">{board.nextTide ? `${board.nextTide.type} ${board.nextTide.time}` : "—"}</p>
          <p className="text-[11px] text-foreground-muted">수온 {board.waterTemp != null ? `${board.waterTemp}℃` : "—"}</p>
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">선상낚시 예상(일)</p>
          <p className="mt-1 font-display text-2xl font-bold text-brand">{board.expectedGuests != null ? `${board.expectedGuests}명` : "—"}</p>
          <p className="text-[11px] text-foreground-muted">{board.estRevenue != null ? `매출 ${Math.round(board.estRevenue / 10000)}만` : "정원·요금 입력 시"}</p>
        </article>
      </div>
      <p className="mt-2 text-[11px] text-foreground-muted">일출 {board.sunrise ?? "—"} · 일몰 {board.sunset ?? "—"}</p>
      {board.notes.length > 0 && (
        <ul className="mt-2 space-y-1">{board.notes.map((n, i) => <li key={i} className="text-sm text-foreground">· {n}</li>)}</ul>
      )}
      <p className="mt-2 text-[11px] text-foreground-muted">※ 파고·풍속(국립해양조사원) 기반 안전 참고 — 최종 출항은 관할 해경·기상특보 확인.</p>
    </section>
  );
}

// ── 염전(천일염) 운영 보드 ──
export function SaltBoardCard({ board }: { board: SaltBoard }) {
  const c = board.harvestLabel === "최적" ? "text-accent" : board.harvestLabel === "불가" ? "text-red-600" : "text-brand";
  return (
    <section className="rounded-2xl border-2 border-accent/40 bg-accent-subtle/20 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand">🧂 염전 운영 보드</h2>
        <span className="text-xs text-foreground-muted">오늘 채염 판단</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">채염 적합도</p>
          <p className={`mt-1 font-display text-3xl font-bold ${c}`}>{board.harvestLabel}</p>
          <p className="text-[11px] text-foreground-muted">하늘 {board.sky ?? "—"}</p>
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">바람(증발)</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.windSpeed != null ? `${board.windSpeed.toFixed(0)}m/s` : "—"}</p>
        </article>
      </div>
      {board.notes.length > 0 && (
        <ul className="mt-3 space-y-1">{board.notes.map((n, i) => <li key={i} className="text-sm text-foreground">· {n}</li>)}</ul>
      )}
      <p className="mt-2 text-[11px] text-foreground-muted">※ 실시간 날씨·바람 기반 추정 — 결정지 상태는 현장 확인.</p>
    </section>
  );
}

// ── 농업 운영 보드 ──
export function FarmingBoardCard({ board }: { board: FarmingBoard }) {
  const c = board.statusLabel === "경보" ? "text-red-600" : board.statusLabel === "주의" ? "text-amber-600" : "text-accent";
  return (
    <section className="rounded-2xl border-2 border-accent/40 bg-accent-subtle/20 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand">🌾 농업 운영 보드</h2>
        <span className="text-xs text-foreground-muted">영농 기상 경보</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">영농 여건</p>
          <p className={`mt-1 font-display text-3xl font-bold ${c}`}>{board.statusLabel}</p>
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">오늘 기온</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.todayTemp != null ? `${Math.round(board.todayTemp)}°` : "—"}</p>
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">주말 최고</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.weekendMaxTemp != null ? `${board.weekendMaxTemp}°` : "—"}</p>
        </article>
      </div>
      {board.alerts.length > 0 && (
        <ul className="mt-3 space-y-2">
          {board.alerts.map((a, i) => (
            <li key={i} className="flex gap-2 rounded-xl border border-accent/20 bg-background p-2.5">
              <span aria-hidden>{a.icon}</span><span className="text-sm text-foreground">{a.text}</span>
            </li>
          ))}
        </ul>
      )}
      {board.notes.length > 0 && (
        <ul className="mt-2 space-y-1">{board.notes.map((n, i) => <li key={i} className="text-[12px] text-foreground-muted">· {n}</li>)}</ul>
      )}
      <p className="mt-2 text-[11px] text-foreground-muted">※ 기상청 단기·주말 예보 기반 — 정밀 방제는 농업기술센터 안내 확인.</p>
    </section>
  );
}

// ── 여행사 운영 보드 ──
export function TravelBoardCard({ board }: { board: TravelBoard }) {
  const fitColor = board.fitLabel.startsWith("주의") ? "text-red-600" : board.fitLabel === "좋음" ? "text-accent" : "text-brand";
  return (
    <section className="rounded-2xl border-2 border-accent/40 bg-accent-subtle/20 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand">🧭 여행사 운영 보드</h2>
        <span className="text-xs text-foreground-muted">{board.weekend.sat.slice(5)}~{board.weekend.sun.slice(5)} 주말 · 수요 ‘{board.level}’</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">투어 진행 적합도</p>
          <p className={`mt-1 font-display text-2xl font-bold ${fitColor}`}>{board.fitLabel}</p>
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 예약(일)</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.expectedBookings != null ? `${board.expectedBookings}명` : "—"}</p>
          {board.capacity != null && <p className="text-[11px] text-foreground-muted">정원 {board.capacity}명 기준</p>}
        </article>
        <article className="rounded-xl bg-background p-4 text-center shadow-card">
          <p className="text-xs text-foreground-muted">예상 매출(일)</p>
          <p className="mt-1 font-display text-3xl font-bold text-brand">{board.estRevenue != null ? `${Math.round(board.estRevenue / 10000)}만` : "—"}</p>
          <p className="text-[11px] text-foreground-muted">{board.estRevenue != null ? "예약×상품가" : "정원·상품가 입력 시"}</p>
        </article>
      </div>
      {board.notes.length > 0 && (
        <ul className="mt-3 space-y-1">{board.notes.map((n, i) => <li key={i} className="text-sm text-foreground">· {n}</li>)}</ul>
      )}
      {board.expectedBookings == null && (
        <p className="mt-3 text-xs text-foreground-muted">💡 가게 정보에 <strong className="text-brand">일 투어 정원·1인 상품가</strong>를 입력하면 예상 예약·매출이 계산됩니다.</p>
      )}
      <p className="mt-2 text-[11px] text-foreground-muted">※ 태안 관광 수요·날씨·파고 기반 추정치 — 섬·해상 투어는 기상 영향 큼.</p>
    </section>
  );
}

// ── 가게 프로필 설정 ── (내 페이지에서도 재사용)
export function ShopSetup({ onSaved }: { onSaved: () => void }) {
  const [industry, setIndustry] = useState<ShopIndustry | null>(null);
  const [eupMyeon, setEupMyeon] = useState<string>("");
  const [name, setName] = useState("");
  const [rooms, setRooms] = useState("");
  const [wkPrice, setWkPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!industry) { setErr("업종을 선택하세요."); return; }
    setSaving(true); setErr(null);
    try {
      const r = await updateShopProfile({
        industry, eupMyeon: eupMyeon || undefined, name: name || undefined,
        capacity: rooms ? Number(rooms) : undefined,
        // 숙박=주말 기본가(weekendPrice), 그 외(음식·카페·레저·소매·낚시)=객단가/체험료/요금(basePrice)
        weekendPrice: industry === "lodging" && wkPrice ? Number(wkPrice) : undefined,
        basePrice: (industry === "food" || industry === "cafe" || industry === "leisure" || industry === "retail" || industry === "fishing" || industry === "travel") && wkPrice ? Number(wkPrice) : undefined,
      });
      if (r.ok) onSaved();
      else if (r.needOnboarding) setErr("먼저 관심사 설정(온보딩)을 완료해주세요.");
    } catch { setErr("저장 실패. 잠시 후 다시 시도하세요."); }
    finally { setSaving(false); }
  }

  return (
    <section className="rounded-2xl border border-accent/30 bg-accent-subtle/20 p-5">
      <p className="font-semibold text-brand">🏪 내 가게 정보 설정</p>
      <p className="mt-1 text-sm text-foreground-muted">업종·지역에 맞춘 실행 제안을 받으려면 가게 정보를 알려주세요.</p>
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {INDUSTRY_OPTIONS.map((o) => (
            <button key={o.value} type="button" onClick={() => setIndustry(o.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${industry === o.value ? "bg-brand text-background" : "bg-brand/5 text-foreground-muted hover:bg-brand/10"}`}>
              {o.emoji} {o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={eupMyeon} onChange={(e) => setEupMyeon(e.target.value)} className="rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm">
            <option value="">읍·면 선택(선택)</option>
            {REGION_OPTIONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="상호(선택)" className="rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm" />
        </div>
        {industry && ["lodging", "food", "cafe", "leisure", "retail", "fishing", "travel"].includes(industry) && (
          <div className="flex flex-wrap gap-2">
            <input value={rooms} onChange={(e) => setRooms(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric"
              placeholder={industry === "lodging" ? "객실 수(예: 20)" : industry === "leisure" ? "일 정원(예: 50)" : industry === "retail" ? "평일 평균 방문객(예: 100)" : industry === "fishing" ? "승선 정원(예: 12)" : industry === "travel" ? "일 투어 정원(예: 40)" : "좌석 수(예: 40)"}
              className="w-40 rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm" />
            <input value={wkPrice} onChange={(e) => setWkPrice(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric"
              placeholder={industry === "lodging" ? "주말 기본가(원, 예: 80000)" : industry === "leisure" ? "1인 체험료(원, 예: 30000)" : industry === "fishing" ? "1인 승선료(원, 예: 50000)" : industry === "travel" ? "1인 상품가(원, 예: 45000)" : "객단가(원, 예: 15000)"}
              className="w-44 rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm" />
            <span className="self-center text-xs text-foreground-muted">→ {industry === "lodging" ? "권장가·예상 매출" : industry === "leisure" ? "예상 참가자·매출" : industry === "retail" ? "예상 방문·매출" : industry === "fishing" ? "출항·예상 매출" : industry === "travel" ? "예상 예약·매출" : "예상 손님·매출"} 계산</span>
          </div>
        )}
        {industry && (industry === "salt" || industry === "farming") && (
          <p className="text-xs text-foreground-muted">날씨·바람 기반 운영 보드가 표시됩니다(별도 입력 불필요).</p>
        )}
        <div className="flex">
          <button type="button" onClick={save} disabled={saving} className="btn-accent px-4 py-2 text-sm disabled:opacity-60">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
        {err && <p className="text-xs text-red-600">{err} {err.includes("온보딩") && <Link href="/me/onboarding" className="underline">온보딩 하기</Link>}</p>}
      </div>
    </section>
  );
}

// ── 미리보기(블러)용 정적 샘플 ──
function OwnerSample() {
  const WEEKEND = [
    { day: "금", index: "보통", weather: "맑음 22°" },
    { day: "토", index: "혼잡", weather: "맑음 24°" },
    { day: "일", index: "주의", weather: "오후 비 19°" },
  ];
  const ACTIONS = [
    { icon: "💰", title: "토요일 1박 +5,000원", why: "꽃지·만리포 방문 +12% 예상" },
    { icon: "🛏️", title: "객실 풀가동 준비", why: "토요일 피크. 노쇼 대비 예약금 안내" },
    { icon: "🌧️", title: "일요일 환불 문의 대비", why: "오후 비 예보" },
  ];
  return (
    <div className="space-y-12">
      <section className="pt-2">
        <p className="eyebrow"><span className="inline-block w-6 h-px bg-accent" aria-hidden /> 사장님 맞춤 브리핑</p>
        <h1 className="mt-4 text-display-sm font-bold text-brand">안녕하세요, 사장님 👋</h1>
        <p className="mt-2 text-foreground-muted">안면도 윤슬펜션 · 펜션 — 이번 주말, 토요일이 피크예요.</p>
      </section>
      <section>
        <h2 className="text-xl font-bold text-brand">이번 주말 수요 예측</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {WEEKEND.map((d) => (
            <article key={d.day} className="rounded-2xl border border-brand/12 bg-background p-5 shadow-card">
              <span className="font-display text-2xl text-brand">{d.day}</span>
              <p className="mt-4 text-sm">{d.weather} · {d.index}</p>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-xl font-bold text-brand">오늘의 실행 제안</h2>
        <div className="mt-4 space-y-2.5">
          {ACTIONS.map((a) => (
            <article key={a.title} className="flex gap-4 rounded-2xl border border-accent/30 bg-accent-subtle/20 p-5">
              <span className="text-2xl" aria-hidden>{a.icon}</span>
              <div><p className="font-semibold text-brand">{a.title}</p><p className="mt-1 text-sm text-foreground-muted">{a.why}</p></div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
