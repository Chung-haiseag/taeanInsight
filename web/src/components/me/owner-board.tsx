"use client";

// 내 페이지용 사장님 보드 — 가게 정보가 있으면 owner-brief(모텔 운영 보드·실행 제안)를 노출.
// 사장님 홈(OwnerHome)과 같은 데이터를 /me에서도 바로 보이게.

import { useEffect, useState } from "react";
import Link from "next/link";

import { fetchOwnerBrief, type OwnerBrief } from "@/lib/api/owner";
import { LodgingBoardCard, FoodBoardCard, LeisureBoardCard, RetailBoardCard, FishingBoardCard, SaltBoardCard, FarmingBoardCard, TravelBoardCard, RealtorBoardCard, GolfBoardCard, AquaBoardCard, ShopSetup } from "@/components/home/owner-home";

export function MeOwnerBoard() {
  const [brief, setBrief] = useState<OwnerBrief | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => fetchOwnerBrief().then(setBrief).catch(() => {});
  useEffect(() => { void load(); }, []);

  if (!brief) return null; // 로딩 중
  if (open) return <ShopSetup onSaved={() => { setOpen(false); void load(); }} />;

  // 가게 정보가 없으면 — 여행 플래너(개인) + 사장님 입력 안내
  if (!brief.hasShop) {
    return (
      <div className="space-y-5">
        <TripPlanner brief={brief} />
        <button type="button" onClick={() => setOpen(true)}
          className="w-full rounded-2xl border border-dashed border-accent/40 bg-accent-subtle/15 p-4 text-left hover:bg-accent-subtle/25">
          <p className="font-semibold text-brand">🏪 사장님이세요? 가게 정보를 입력하세요</p>
          <p className="mt-0.5 text-sm text-foreground-muted">업종(숙박·음식·카페·낚시·염전·농업 등)을 넣으면 <strong className="text-brand">맞춤 운영 보드</strong>를 드려요. →</p>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {brief.lodging && <LodgingBoardCard board={brief.lodging} nearby={brief.market.nearbyLodging} />}
      {brief.food && <FoodBoardCard board={brief.food} />}
      {brief.leisure && <LeisureBoardCard board={brief.leisure} />}
      {brief.retail && <RetailBoardCard board={brief.retail} />}
      {brief.fishing && <FishingBoardCard board={brief.fishing} />}
      {brief.salt && <SaltBoardCard board={brief.salt} />}
      {brief.farming && <FarmingBoardCard board={brief.farming} />}
      {brief.travel && <TravelBoardCard board={brief.travel} />}
      {brief.realtor && <RealtorBoardCard board={brief.realtor} />}
      {brief.golf && <GolfBoardCard board={brief.golf} />}
      {brief.aqua && <AquaBoardCard board={brief.aqua} />}

      <div className="text-right">
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-accent hover:underline">
          ✏️ 가게 정보 수정{brief.industry === "lodging" ? "(객실수·요금)" : brief.industry === "food" || brief.industry === "cafe" ? "(좌석수·객단가)" : brief.industry === "leisure" ? "(정원·체험료)" : brief.industry === "retail" ? "(방문객·객단가)" : brief.industry === "fishing" ? "(정원·승선료)" : brief.industry === "travel" ? "(정원·상품가)" : brief.industry === "golf" ? "(정원·그린피)" : ""}
        </button>
      </div>

      {brief.actions.length > 0 && (
        <section className="rounded-2xl border border-brand/10 bg-background p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-bold text-brand">💡 오늘의 실행 제안</h2>
          <div className="mt-3 space-y-2">
            {brief.actions.map((a, i) => (
              <article key={i} className="flex gap-3 rounded-xl border border-accent/20 bg-accent-subtle/15 p-3">
                <span className="text-xl" aria-hidden>{a.icon}</span>
                <div>
                  <p className="font-semibold text-brand">
                    {a.text}
                    {a.tag && <span className={`ml-2 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${a.tag === "안전" ? "bg-red-100 text-red-700" : a.tag === "매출" ? "bg-accent/20 text-accent" : "bg-brand/10 text-brand"}`}>{a.tag}</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground-muted">{a.why}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <TripPlanner brief={brief} />
    </div>
  );
}

// 관광객·주민 "주말 태안 여행 플래너" — 사업자가 아닌 개인 페르소나용(날씨·일몰·물때·축제·혼잡).
function TripPlanner({ brief }: { brief: OwnerBrief }) {
  const d = brief.demand;
  const fc = (w: { tmax: number | null; pop: number | null; sky: string | null } | null | undefined) => {
    if (!w) return "예보 준비 중";
    const p: string[] = [];
    if (w.sky) p.push(w.sky);
    if (w.tmax != null) p.push(`최고 ${w.tmax}°`);
    if (w.pop != null) p.push(`강수 ${w.pop}%`);
    return p.join(" · ") || "예보 준비 중";
  };
  const crowd: Record<string, string> = { 매우높음: "매우 붐빔", 높음: "붐빔", 보통: "보통", 낮음: "여유", 매우낮음: "한산" };
  const nowHM = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(11, 16);
  const lowTide = (brief.tide?.events ?? []).find((e) => e.type === "저조" && (e.time ?? "").slice(0, 5) >= nowHM)
    ?? (brief.tide?.events ?? []).find((e) => e.type === "저조") ?? null;
  const fest = brief.market.festivals?.[0] ?? null;

  return (
    <section className="rounded-2xl border border-brand/10 bg-gradient-to-br from-accent-subtle/30 to-background p-5 shadow-card sm:p-6">
      <h2 className="text-lg font-bold text-brand">🧳 이번 주말 태안 여행 플래너</h2>
      <p className="mt-0.5 text-xs text-foreground-muted">나들이 계획에 필요한 날씨·일몰·물때·축제를 한눈에</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-background/70 p-3">
          <p className="text-xs font-semibold text-brand">☀️ 주말 날씨</p>
          <p className="mt-1 text-sm text-foreground">토 {fc(d?.weather?.sat)}</p>
          <p className="text-sm text-foreground">일 {fc(d?.weather?.sun)}</p>
        </div>
        <div className="rounded-xl bg-background/70 p-3">
          <p className="text-xs font-semibold text-brand">🧭 혼잡·자외선</p>
          <p className="mt-1 text-sm text-foreground">관광객 {d?.available ? (crowd[d.level] ?? d.level) : "—"}{d?.available ? ` (지수 ${d.index})` : ""}</p>
          <p className="text-sm text-foreground">자외선 {brief.uv?.level ?? "—"}</p>
        </div>
        <div className="rounded-xl bg-background/70 p-3">
          <p className="text-xs font-semibold text-brand">🌅 일출·일몰</p>
          <p className="mt-1 text-sm text-foreground">일출 {brief.sun?.sunrise ?? "—"} · 일몰 {brief.sun?.sunset ?? "—"}</p>
          <p className="text-[11px] text-foreground-muted">꽃지·만리포 노을 명소</p>
        </div>
        <div className="rounded-xl bg-background/70 p-3">
          <p className="text-xs font-semibold text-brand">🦪 갯벌체험 적기(간조)</p>
          <p className="mt-1 text-sm text-foreground">{lowTide ? `${lowTide.time?.slice(0, 5)} 전후` : "오늘 정보 없음"}</p>
          <p className="text-[11px] text-foreground-muted">물 빠지는 시간 기준</p>
        </div>
      </div>
      {fest && (
        <p className="mt-3 rounded-xl bg-accent-subtle/30 p-2.5 text-sm text-brand">🎉 {fest.title} {fest.dday === 0 ? "오늘!" : `D-${fest.dday}`}</p>
      )}
      <div className="mt-3 flex gap-3 text-xs font-semibold">
        <Link href="/live" className="text-accent hover:underline">실시간 현황 →</Link>
        <Link href="/query" className="text-accent hover:underline">AI에게 여행 코스 묻기 →</Link>
      </div>
    </section>
  );
}
