// 데이터 지도 — 태안 인사이트가 예측·경보·시세에 쓰는 데이터 소스를 영역·유형·상태로 분류한 공개 페이지.
//   플랫폼의 데이터 깊이를 투명하게 보여줘 신뢰·구독 동인. 소스: GET /api/conditions/data-map.

import type { Metadata } from "next";

import Link from "next/link";

import { getDataMap, getKgStats, fetchReportMetrics, getAgriPrices, getSeafood, getAuction, getAuctionForecast, getSeasonal, getFarm, getAqua, type DataCatalogItem, type KgStatsView } from "@/lib/api/reports";
import { RealEstatePanel, AgriCard, FarmCard, AquaCard, SeafoodCard, AuctionCard, AuctionForecastCard, SeasonalCard, OilCard, IndustryStructure } from "@/components/reports/report-charts";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle, Pill, SecHead } from "@/components/editorial";

export const metadata: Metadata = {
  title: "태안 지역경제 — 부동산·수산 시세·물가",
  description: "태안 부동산 실거래·수산 시세·위판 경매·물가·유가·산업구조 — 지역 경제 데이터와 우리가 쓰는 전체 데이터 출처를 한눈에.",
};
export const revalidate = 3600;

// 영역 색은 장식(왼쪽 띠)일 뿐 — 영역 이름이 제목으로 따로 있어 색만으로 구분하지 않는다.
const CATS: Array<{ label: string; key: string; color: string }> = [
  { label: "관광 · 나들이", key: "관광", color: "#f97316" },
  { label: "바다 · 해변", key: "바다", color: "#0ea5e9" },
  { label: "수산", key: "수산", color: "#2563eb" },
  { label: "농업", key: "농업", color: "#16a34a" },
  { label: "날씨 · 환경 · 안전", key: "날씨·안전", color: "#f59e0b" },
  { label: "지역경제 · 신뢰 · 배달", key: "지역경제", color: "#8b5cf6" },
];

const TYPE_ORDER = ["예측", "경보", "시세", "실측", "달력", "구조", "검증", "요인", "배달"];
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

// 2026-10 리디자인(가독성) — /live와 같은 체계. 흐름:
//   머리 → 부동산·기름값 → 농업 → 수산 → 산업 구조 → 데이터 출처(영역별·출처별·유형별) → 지식그래프.
//   섹션 표시 조건은 각 카드의 '없으면 숨김' 조건과 같게 맞춰, 카드가 다 숨으면 빈 제목만 남지 않게 한다.
export default async function DataMapPage() {
  const [sources, kg, metrics, agri, seafood, auction, auctionForecast, seasonal, farm, aqua] = await Promise.all([
    getDataMap(), getKgStats(), fetchReportMetrics(), getAgriPrices(), getSeafood(), getAuction(), getAuctionForecast(), getSeasonal(), getFarm(), getAqua(),
  ]);
  const live = sources.filter((s) => s.status === "live").length;
  const prog = sources.filter((s) => s.status === "progress").length;
  const typeGroups = TYPE_ORDER.map((t) => ({ type: t, names: sources.filter((s) => s.type === t).map((s) => s.name) })).filter((g) => g.names.length);
  const sourceBuckets = SRC_BUCKETS.map((b) => ({ label: b.label, n: sources.filter((s) => b.kw.some((k) => s.source.includes(k))).length })).filter((b) => b.n > 0);
  const maxBucket = Math.max(1, ...sourceBuckets.map((b) => b.n));

  const showMoney = !!metrics && (!!metrics.realestate.apt || !!metrics.realestate.land || !!metrics.oil?.gasoline || !!metrics.oil?.diesel);
  const showFarm = (!!agri && agri.crops.some((c) => c.wonPerKg != null)) || (!!farm && (farm.alerts.length > 0 || farm.tasks.length > 0));
  const showSea = (!!aqua && aqua.level !== "정상" && !!aqua.label) || !!seafood?.items.length || !!auction?.fish.length || !!auctionForecast?.items.length || !!seasonal?.inSeason.length;

  return (
    <div className="mx-auto max-w-[1080px] space-y-12 text-ti-ink">
      <PageHeader
        eyebrow="지역경제"
        title="태안 지역경제"
        description="부동산 실거래·수산 시세·위판 경매·물가·유가·산업 구조 — 장사·살림 결정에 쓰는 태안 경제 숫자를 모았습니다."
      />

      {showMoney && metrics && (
        <section aria-labelledby="money-title">
          <SecHead id="money-title" title="부동산·기름값" />
          <div className="space-y-5">
            <RealEstatePanel re={metrics.realestate} compact />
            <OilCard oil={metrics.oil} />
          </div>
        </section>
      )}

      {showFarm && (
        <section aria-labelledby="farm-sec">
          <SecHead id="farm-sec" title="농업" />
          <div className="space-y-5">
            <AgriCard agri={agri} />
            <FarmCard farm={farm} />
          </div>
        </section>
      )}

      {showSea && (
        <section aria-labelledby="sea-sec">
          <SecHead id="sea-sec" title="수산" note="산지 위판장 값과 소매 값을 함께 봅니다." />
          <div className="space-y-5">
            <AquaCard aqua={aqua} />
            <AuctionCard auction={auction} />
            <AuctionForecastCard forecast={auctionForecast} />
            <SeafoodCard seafood={seafood} />
            <SeasonalCard seasonal={seasonal} />
          </div>
        </section>
      )}

      <section aria-labelledby="industry-sec">
        <SecHead id="industry-sec" title="산업 구조" />
        <IndustryStructure />
      </section>

      {/* 데이터 지도 — 우리가 쓰는 전체 데이터 출처(투명성·신뢰) */}
      <section aria-labelledby="datamap-title">
        <SecHead
          id="datamap-title"
          title="우리가 쓰는 데이터 출처"
          note="관광·바다·수산·농업·날씨까지, 태안 인사이트의 모든 예측·시세는 공개된 공공데이터에 근거합니다 — 지어내지 않는다는 증거입니다."
        />

        {sources.length === 0 ? (
          <p className="rounded-[18px] border border-ti-line bg-ti-surface p-8 text-center text-ti-ink2">데이터 지도를 불러오지 못했습니다. 잠시 뒤 다시 확인해 주세요.</p>
        ) : (
          <div className="space-y-8">
            <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-ti-line bg-ti-line md:grid-cols-5">
              <Stat n={sources.length} unit="개" label="데이터 소스" />
              <Stat n={live} unit="개" label="운영 중" />
              <Stat n={prog} unit="개" label="준비 중" />
              <Stat n={CATS.length} unit="개" label="영역" />
              <Stat n={0} unit="개" label="새 유료 API (전부 무료)" />
            </dl>

            {CATS.map((cat, ci) => {
              const items = sources.filter((s) => s.cat === cat.key);
              if (!items.length) return null;
              return (
                <section key={cat.key} aria-labelledby={`cat-${ci}`}>
                  <h3 id={`cat-${ci}`} className="flex items-center gap-2.5 text-[1.15rem] font-bold text-ti-ink">
                    <span className="inline-block h-3.5 w-3.5 rounded" style={{ background: cat.color }} aria-hidden />
                    {cat.label}
                    <span className="text-[0.95rem] font-normal tabular-nums text-ti-muted">{items.length}개</span>
                  </h3>
                  <ul className="m-0 mt-3 grid list-none gap-3 p-0 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((s) => <ItemCard key={s.key} s={s} color={cat.color} />)}
                  </ul>
                </section>
              );
            })}

            <div className="grid items-start gap-5 md:grid-cols-2">
              <Card labelledBy="bucket-title">
                <CardTitle id="bucket-title">출처 기관별</CardTitle>
                <ul className="m-0 mt-3 grid list-none gap-2.5 p-0">
                  {sourceBuckets.map((b) => (
                    <li key={b.label} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 text-ti-ink">{b.label}</span>
                      {/* 막대는 장식 — 숫자를 옆에 글로 적는다 */}
                      <span className="hidden h-2 w-[110px] shrink-0 overflow-hidden rounded-full bg-ti-sunk md:block" aria-hidden="true">
                        <span className="block h-full rounded-full bg-ti-petrol" style={{ width: `${Math.round((b.n / maxBucket) * 100)}%` }} />
                      </span>
                      <span className="w-10 shrink-0 text-right font-bold tabular-nums text-ti-ink">{b.n}개</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card labelledBy="type-title">
                <CardTitle id="type-title">쓰임새별</CardTitle>
                <ul className="m-0 mt-3 grid list-none gap-0 divide-y divide-ti-line p-0">
                  {typeGroups.map((g) => (
                    <li key={g.type} className="py-2.5 first:pt-0 last:pb-0">
                      <p className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ti-ink">{g.type}</span>
                        <span className="font-bold tabular-nums text-ti-ink">{g.names.length}개</span>
                      </p>
                      <p className="mt-1 text-[0.9rem] leading-snug text-ti-ink2">{g.names.join(" · ")}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <div className="space-y-2 border-t border-ti-line pt-5 text-[0.95rem] leading-relaxed text-ti-ink2">
              <p><Pill tone="warn">준비 중</Pill> 양식 수온 경보는 지금 표층 수온으로 근사한 임시 값입니다. 실시간어장정보(용존산소·양식장 실측) 활용신청 승인 뒤 정식화 예정.</p>
              <p><Pill tone="plain">보류·미채택</Pill> 검색 관심도·숙박(네이버 데이터랩 신규등록 중단) · 관광소비·수요강도(KTO 카드 빈 응답) · 관광지점 입장객(태안 등록 반쪽).</p>
              <p><Pill tone="ok">핵심 원칙</Pill> 전부 무료 공공데이터·큐레이션(새 유료 API 0), 아카이브 RAG + 실시간 근거로 출처 표기, Cloudflare 전용(Workers·D1·R2).</p>
            </div>
          </div>
        )}
      </section>

      {sources.length > 0 && kg && <KnowledgeGraph kg={kg} />}
    </div>
  );
}

function Stat({ n, unit, label }: { n: number; unit: string; label: string }) {
  return (
    <div className="min-w-0 bg-ti-surface px-4 py-3.5">
      <dt className="font-semibold text-ti-ink2">{label}</dt>
      <dd className="m-0 mt-1">
        <span className="font-display text-[2rem] font-semibold leading-none tabular-nums text-ti-ink">{n}</span>
        <span className="ml-1 text-ti-muted">{unit}</span>
      </dd>
    </div>
  );
}

function ItemCard({ s, color }: { s: DataCatalogItem; color: string }) {
  const progress = s.status === "progress";
  return (
    <li className="min-w-0 rounded-[14px] border border-ti-line bg-ti-surface p-4" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-ti-ink">{s.name}</h4>
        <Pill tone={progress ? "warn" : "ok"}>{progress ? "준비 중" : "운영 중"}</Pill>
      </div>
      <p className="mt-1.5 text-[0.95rem] leading-snug text-ti-ink2">{s.desc}</p>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9rem]">
        <Pill tone="plain">{s.type}</Pill>
        <span className="text-ti-ink2">출처 {s.source}</span>
      </p>
    </li>
  );
}

function KgStat({ n, label, accent }: { n: string; label: string; accent?: boolean }) {
  return (
    <div className={`rounded-[14px] bg-ti-surface p-3.5 ${accent ? "border-2 border-ti-petrol" : "border border-ti-line"}`}>
      <dt className="font-semibold text-ti-ink2">{label}</dt>
      <dd className="m-0 mt-1 font-display text-[1.8rem] font-semibold leading-none tabular-nums text-ti-ink">{n}</dd>
    </div>
  );
}

// 지식그래프 — 37년 아카이브 온톨로지(개체·관계·규모·2층 구조)
function KnowledgeGraph({ kg }: { kg: KgStatsView }) {
  const m = (n: number) => (n == null ? "0" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 10000 ? `${Math.round(n / 1000)}천` : n.toLocaleString());
  return (
    <section aria-labelledby="kg-title">
      <SecHead
        id="kg-title"
        title="지식그래프 — 태안 온톨로지"
        note="37년 아카이브의 인물부터 위판장·수산물까지를 개체·관계로 엮었습니다. 검수를 통과한 사실만 AI 답변의 근거로 씁니다."
      />

      <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KgStat n={m(kg.nodes)} label="개체(노드)" />
        <KgStat n={m(kg.edges)} label="관계(엣지)" />
        <KgStat n={kg.types.length.toString()} label="개체 종류" />
        <KgStat n={(kg.verified ?? 0).toLocaleString()} label="검수 완료 사실" accent />
      </dl>

      <div className="mt-5 grid items-start gap-5 md:grid-cols-2">
        <Card labelledBy="kg-entity-title">
          <CardTitle id="kg-entity-title">개체 종류</CardTitle>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
            {kg.types.map((t) => (
              <li key={t.name} className="inline-flex items-baseline gap-1.5 rounded-full bg-ti-sunk px-3 py-1">
                <b className="text-ti-ink">{t.label}</b><span className="text-[0.9rem] tabular-nums text-ti-ink2">{m(t.n)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card labelledBy="kg-rel-title">
          <CardTitle id="kg-rel-title">관계 종류</CardTitle>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
            {kg.relations.map((r) => (
              <li key={r.name} className="inline-flex flex-wrap items-baseline gap-x-1.5 rounded-full bg-ti-sunk px-3 py-1">
                <b className="text-ti-ink">{r.label}</b>
                <span className="text-[0.9rem] text-ti-ink2">{r.src} → {r.dst}</span>
                <span className="text-[0.9rem] tabular-nums text-ti-ink2">{m(r.n)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-[14px] bg-ti-sunk p-4">
          <h3 className="font-bold text-ti-ink">탐색층 · 통계 관계</h3>
          <p className="mt-1 text-[0.95rem] leading-snug text-ti-ink2">기사에 함께 나온 횟수 등 AI가 자동으로 뽑은 대규모 관계 — 인물 관계도·이웃 순위에 씁니다. 넓고 통계적입니다.</p>
        </div>
        <div className="rounded-[14px] border-2 border-ti-petrol bg-ti-surface p-4">
          <h3 className="flex flex-wrap items-center gap-2 font-bold text-ti-ink">사실층 · 검수 완료 <Pill tone="ok">확인된 사실</Pill></h3>
          <p className="mt-1 text-[0.95rem] leading-snug text-ti-ink2">검수를 통과한 관계(역임·취급 등)만 &lsquo;확인된 사실&rsquo;로 AI 답변에 인용합니다 — 지어내기 방지.</p>
        </div>
      </div>

      <Link href="/people" className="mt-4 inline-flex min-h-11 items-center font-bold text-ti-petrol-ink underline underline-offset-4">인물 탐색에서 관계 그래프 보기</Link>
    </section>
  );
}
