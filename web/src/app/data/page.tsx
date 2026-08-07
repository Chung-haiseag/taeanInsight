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

const TYPE_ORDER = ["예측", "경보", "시세", "실측", "달력", "구조", "검증", "요인", "배달"];
const TYPE_ICON: Record<string, string> = {
  "예측": "🔮", "경보": "🚨", "시세": "💰", "실측": "📏", "달력": "🗓️", "구조": "🏗️", "검증": "📊", "요인": "🧩", "배달": "📣",
};
// 데이터 소스별 버킷(출처 키워드로 집계)
const SRC_BUCKETS: Array<{ label: string; kw: string[] }> = [
  { label: "기상청 (단기예보·특보·특일)", kw: ["기상청", "특일"] },
  { label: "국립해양조사원 (수온·파고·조석)", kw: ["해양조사원"] },
  { label: "해양수산부 위판 (경매가·물량)", kw: ["위판"] },
  { label: "한국관광공사 (방문자)", kw: ["관광공사"] },
  { label: "에어코리아 (미세먼지)", kw: ["에어코리아"] },
  { label: "KAMIS · 공영도매시장 (시세)", kw: ["KAMIS", "도매시장"] },
  { label: "도로공사 · 국토부", kw: ["도로공사", "국토"] },
  { label: "큐레이션 (축제·개화·제철·산업)", kw: ["큐레이션"] },
];

export default async function DataMapPage() {
  const sources = await getDataMap();
  const live = sources.filter((s) => s.status === "live").length;
  const prog = sources.filter((s) => s.status === "progress").length;
  const typeGroups = TYPE_ORDER.map((t) => ({ type: t, names: sources.filter((s) => s.type === t).map((s) => s.name) })).filter((g) => g.names.length);
  const sourceBuckets = SRC_BUCKETS.map((b) => ({ label: b.label, n: sources.filter((s) => b.kw.some((k) => s.source.includes(k))).length })).filter((b) => b.n > 0);
  const maxBucket = Math.max(1, ...sourceBuckets.map((b) => b.n));

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
            <Stat n={live} label="라이브" color="#16a34a" />
            <Stat n={prog} label="진행중" color="#d97706" />
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

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <section className="card p-5">
              <h3 className="text-sm font-bold text-brand">데이터 소스별</h3>
              <div className="mt-3 space-y-2.5">
                {sourceBuckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-3 text-[0.82rem]">
                    <span className="flex-1 text-foreground">{b.label}</span>
                    <span className="hidden h-1.5 w-[120px] overflow-hidden rounded-full bg-brand/10 sm:block">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((b.n / maxBucket) * 100)}%` }} />
                    </span>
                    <span className="w-5 text-right font-semibold tabular-nums text-brand">{b.n}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="card p-5">
              <h3 className="text-sm font-bold text-brand">유형별</h3>
              <div className="mt-3 space-y-2">
                {typeGroups.map((g) => (
                  <div key={g.type} className="border-b border-brand/10 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">{TYPE_ICON[g.type] ?? "•"} {g.type}</span>
                      <span className="font-bold tabular-nums text-brand">{g.names.length}</span>
                    </div>
                    <p className="mt-0.5 text-[0.7rem] leading-snug text-foreground-muted">{g.names.join(" · ")}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-xs text-foreground-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#16a34a" }} />라이브</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#d97706" }} />진행중(임시·업그레이드 대기)</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#94a3b8" }} />보류·미채택</span>
          </div>

          <div className="hairline mt-6 space-y-1.5 pt-5 text-xs leading-relaxed text-foreground-muted">
            <p><b className="text-foreground">진행중</b> — 양식 수온 경보는 현재 표층 수온 근사(임시). 실시간어장정보(용존산소·양식장 실측) 활용신청 승인 후 정식화 예정.</p>
            <p><b className="text-foreground">보류·미채택</b> — 검색 관심도·숙박(네이버 데이터랩 신규등록 중단) · 관광소비·수요강도(KTO 카드 빈 응답) · 관광지점 입장객(태안 등록 반쪽).</p>
            <p><b className="text-foreground">핵심 원칙</b> — 전부 무료 공공데이터·큐레이션(새 유료 API 0), 아카이브 RAG + 실시간 근거로 출처 표기, Cloudflare 전용(Workers·D1·R2).</p>
          </div>
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
