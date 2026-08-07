// 데이터 지도 — 태안 인사이트가 예측·경보·시세에 쓰는 데이터 소스를 영역·유형·상태로 분류한 공개 페이지.
//   플랫폼의 데이터 깊이를 투명하게 보여줘 신뢰·구독 동인. 소스: GET /api/conditions/data-map.

import type { Metadata } from "next";

import { getDataMap, type DataCatalogItem } from "@/lib/api/reports";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "데이터 지도",
  description: "태안 인사이트가 관광·바다·수산·농업·날씨·지역경제 예측에 쓰는 데이터 소스를 한눈에.",
};
export const revalidate = 3600;

const CATS: Array<{ label: string; key: string; color: string }> = [
  { label: "관광 · 나들이", key: "관광", color: "#f97316" },
  { label: "바다 · 해변", key: "바다", color: "#0ea5e9" },
  { label: "수산", key: "수산", color: "#2563eb" },
  { label: "농업", key: "농업", color: "#16a34a" },
  { label: "날씨 · 환경 · 안전", key: "날씨·안전", color: "#f59e0b" },
  { label: "지역경제 · 신뢰 · 배달", key: "지역경제", color: "#8b5cf6" },
];

const EMOJI: Record<string, string> = {
  demand: "🎯", visitors: "👣", bloom: "🌷", sunset: "🌅", festivals: "🎪", traffic: "🚗",
  beaches: "🏖️", mudflat: "🦪", fishing: "🎣", fog: "🌫️",
  auction: "🎣", auctionForecast: "📈", seafood: "🐟", seasonal: "🗓️", aqua: "🦪",
  agri: "🥬", farm: "🌾", weather: "🌤️", alert: "⚠️", dust: "🌫️", fireRisk: "🔥",
  industry: "🏭", holiday: "📅", demandActuals: "📊", brief: "📣", realestate: "🏘️",
};

const TYPE_DESC: Array<{ t: string; label: string }> = [
  { t: "예측", label: "🔮 예측" }, { t: "경보", label: "🚨 경보" }, { t: "시세", label: "💰 시세" },
  { t: "실측", label: "📏 실측" }, { t: "달력", label: "🗓️ 달력·적기" }, { t: "배달", label: "📣 배달" },
];

export default async function DataMapPage() {
  const sources = await getDataMap();
  const live = sources.filter((s) => s.status === "live").length;
  const typeCounts: Record<string, number> = {};
  for (const s of sources) typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1;

  return (
    <div className="mx-auto max-w-[1080px]">
      <PageHeader
        eyebrow="DATA MAP · 데이터 지도"
        title="태안 인사이트가 보는 데이터"
        description={<>관광·바다·수산·농업·날씨·지역경제 예측에 쓰는 <strong className="text-brand">모든 데이터 소스</strong>를 한눈에. 전부 <strong className="text-brand">무료 공공데이터·큐레이션</strong>.</>}
      />

      {sources.length === 0 ? (
        <p className="mt-8 card p-8 text-center text-sm text-foreground-muted">데이터 지도를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Stat n={sources.length} label="데이터 소스" />
            <Stat n={live} label="라이브" color="var(--color-accent, #0f9aa8)" />
            <Stat n={CATS.length} label="영역" />
            <Stat n={0} label="새 유료 API · 전부 무료" accent />
          </div>

          {CATS.map((cat) => {
            const items = sources.filter((s) => s.cat === cat.key);
            if (!items.length) return null;
            return (
              <section key={cat.key} className="mt-8">
                <div className="flex items-center gap-2.5">
                  <span className="inline-block h-3 w-3 rounded" style={{ background: cat.color }} aria-hidden />
                  <h2 className="text-lg font-bold text-brand">{cat.label}</h2>
                  <span className="text-xs text-foreground-muted tabular-nums">{items.length}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((s) => <ItemCard key={s.key} s={s} color={cat.color} />)}
                </div>
              </section>
            );
          })}

          <section className="mt-10 card p-5">
            <h3 className="text-sm font-bold text-brand">유형별</h3>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {TYPE_DESC.map(({ t, label }) => (
                <div key={t} className="flex items-center justify-between border-b border-brand/10 pb-1.5 text-sm">
                  <span className="text-foreground">{label}</span>
                  <span className="font-bold tabular-nums text-brand">{typeCounts[t] ?? 0}</span>
                </div>
              ))}
            </div>
          </section>

          <p className="hairline mt-8 pt-5 text-center text-xs text-foreground-muted">
            출처 기상청·국립해양조사원·한국관광공사·해양수산부·에어코리아·KAMIS·한국도로공사·국토교통부·통계청 등 무료 공공데이터 · 아카이브 RAG + 실시간 근거로 출처 표기 · Cloudflare 전용
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ n, label, color, accent }: { n: number; label: string; color?: string; accent?: boolean }) {
  return (
    <div className="card px-4 py-2.5">
      <p className="text-2xl font-extrabold leading-none tabular-nums" style={{ color: accent ? undefined : color }}>
        <span className={accent ? "text-accent" : undefined}>{n}</span>
      </p>
      <p className="mt-1 text-[0.7rem] text-foreground-muted">{label}</p>
    </div>
  );
}

const STATUS_STYLE: Record<string, { dot: string; label: string }> = {
  live: { dot: "#16a34a", label: "라이브" },
  progress: { dot: "#d97706", label: "진행중" },
};

function ItemCard({ s, color }: { s: DataCatalogItem; color: string }) {
  const st = STATUS_STYLE[s.status] ?? STATUS_STYLE.live;
  return (
    <div className="relative rounded-2xl border border-brand/12 bg-background p-4 shadow-card" style={{ borderLeft: `3px solid ${color}` }}>
      <span className="absolute right-3 top-4 h-2.5 w-2.5 rounded-full" style={{ background: st.dot }} title={st.label} aria-hidden />
      <div className="flex items-center gap-2 pr-4">
        <span aria-hidden>{EMOJI[s.key] ?? "•"}</span>
        <span className="font-bold text-brand">{s.name}</span>
      </div>
      <p className="mt-1.5 text-xs leading-snug text-foreground-muted">{s.desc}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-accent-subtle/50 px-2 py-0.5 text-[0.7rem] font-semibold text-brand">{s.type}</span>
        <span className="rounded-full border border-brand/15 px-2 py-0.5 text-[0.7rem] text-foreground-muted">{s.source}</span>
        {s.status === "progress" && <span className="text-[0.7rem] font-semibold text-amber-600">· 업그레이드 예정</span>}
      </div>
    </div>
  );
}
