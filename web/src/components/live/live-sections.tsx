// 지금 태안(/live) — 2026-10 리디자인 섹션들. 홈(신문 1면)과 같은 디자인 체계(ti-* 토큰·세리프 제목).
//   원칙(가독성 우선): 글자는 0.85rem 아래로 내리지 않는다 · 숫자는 크게, 단위는 옆에 · 상태는 '좋음/주의' 같은 쉬운 말 알약
//   · 표 대신 카드 · 이모지 장식 없이 제목으로 말한다. 데이터 함수·출처는 예전 화면과 같다(서버 컴포넌트, 상태 없음).

import Link from "next/link";

import type {
  BloomBoardView, DemandForecast, DustBoardView, FestivalView, FireBoardView, ReportMetrics, TrendItem, WeatherAlertView,
} from "@/lib/api/reports";

// ── 공통 ──

export type Tone = "good" | "ok" | "warn" | "bad" | "plain";

/** 등급 알약 — 밝은 바탕 + 짙은 글자라 고대비 모드에서도 AA. 색만이 아니라 글자로 상태를 말한다. */
const TONE_CLS: Record<Tone, string> = {
  good: "bg-[#DCEBFF] text-[#0B3D91]",
  ok: "bg-[#CFEEDC] text-[#0F4D2E]",
  warn: "bg-[#FCE3B5] text-[#6B3F00]",
  bad: "bg-[#FAD4D1] text-[#8A1C14]",
  plain: "bg-ti-sunk text-ti-ink",
};
export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.85rem] font-bold ${TONE_CLS[tone]}`}>{children}</span>;
}

/** 미세먼지 등급 말 → 알약 색 */
export function airTone(grade: string | null | undefined): Tone {
  if (!grade) return "plain";
  if (grade.includes("매우")) return "bad";
  if (grade.includes("나쁨")) return "warn";
  if (grade.includes("보통")) return "ok";
  if (grade.includes("좋음")) return "good";
  return "plain";
}
/** 측정값 → 한국 기준 등급(미세 30/80/150, 초미세 15/35/75) */
export function pmGrade(kind: "pm10" | "pm25", v: number | null): string | null {
  if (v == null) return null;
  const t = kind === "pm10" ? [30, 80, 150] : [15, 35, 75];
  if (v <= t[0]) return "좋음";
  if (v <= t[1]) return "보통";
  if (v <= t[2]) return "나쁨";
  return "매우나쁨";
}

export function SecHead({ id, title, note, link }: { id: string; title: string; note?: string; link?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-t-2 border-ti-ink pt-3.5">
      <div>
        <h2 id={id} className="font-serif text-[clamp(1.4rem,2.6vw,1.85rem)] font-black tracking-[-0.02em] text-ti-ink">{title}</h2>
        {note && <p className="mt-1 text-ti-ink2">{note}</p>}
      </div>
      {link && <Link href={link.href} className="text-[0.95rem] font-bold text-ti-petrol-ink underline underline-offset-4">{link.label}</Link>}
    </div>
  );
}

const Card = ({ className = "", children, labelledBy }: { className?: string; children: React.ReactNode; labelledBy?: string }) => (
  <section aria-labelledby={labelledBy} className={`min-w-0 rounded-[18px] border border-ti-line bg-ti-surface p-5 ${className}`}>{children}</section>
);
const CardTitle = ({ id, children, aside }: { id?: string; children: React.ReactNode; aside?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-2">
    <h3 id={id} className="text-[1.08rem] font-bold text-ti-ink">{children}</h3>
    {aside}
  </div>
);
const Source = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-[0.85rem] text-ti-muted">{children}</p>;

// ISO(UTC) → KST 'HH:MM'
function kstHm(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 9 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// ── 기상특보 — 발효 중일 때만. 쪽 맨 위에 크게. ──
export function AlertStrip({ alert }: { alert: WeatherAlertView | null }) {
  if (!alert || !alert.active) return null;
  const severe = alert.warnings.some((w) => w.active && ["태풍", "호우", "풍랑", "대설", "폭풍해일", "한파"].includes(w.type));
  return (
    <section aria-label="기상특보" className={`rounded-[14px] border-2 p-4 ${severe ? "border-[#B3261E] bg-[#FDECEA]" : "border-[#9A5B00] bg-[#FFF4DF]"}`}>
      <p className={`text-[1.1rem] font-bold ${severe ? "text-[#8A1C14]" : "text-[#6B3F00]"}`}>기상특보 발효 — {alert.label}</p>
      <p className="mt-1 text-ti-ink">
        {severe ? "야외활동·해수욕·물놀이가 위험합니다. 안전에 유의하세요." : "야외활동 때 건강과 안전에 유의하세요."} (충남 특보구역 기준)
      </p>
    </section>
  );
}

// ── 지금 날씨·대기 — 큰 기온 + 미세먼지 두 칸 ──
export function WeatherNow({ env }: { env: ReportMetrics["environment"] }) {
  const l = env.live;
  if (!l) return null;
  const pm10g = l.pm10 != null ? pmGrade("pm10", l.pm10) : null;
  const pm25g = l.pm25 != null ? pmGrade("pm25", l.pm25) : null;
  const time = kstHm(l.observedAt);
  return (
    <section aria-labelledby="wx-title" className="flex flex-col gap-4 rounded-[20px] border border-ti-line bg-ti-surface p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="wx-title" className="font-serif text-[1.35rem] font-bold text-ti-ink">지금 날씨·대기</h2>
        <p className="text-[0.9rem] text-ti-muted">{time ? `${time} 관측 · ` : ""}기상청·에어코리아</p>
      </div>

      {(l.temp != null || l.sky) && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          {l.temp != null && (
            <p className="font-display text-[3.2rem] font-semibold leading-none tabular-nums text-ti-ink">
              {l.temp}<span className="ml-1 font-sans text-[1.3rem] font-semibold text-ti-ink2">℃</span>
            </p>
          )}
          <dl className="m-0 flex flex-wrap gap-x-6 gap-y-1 pb-1 text-[1.05rem]">
            {l.sky && <div className="flex gap-2"><dt className="text-ti-muted">하늘</dt><dd className="m-0 font-semibold">{l.sky}</dd></div>}
            {l.humidity != null && <div className="flex gap-2"><dt className="text-ti-muted">습도</dt><dd className="m-0 font-semibold tabular-nums">{l.humidity}%</dd></div>}
            {l.grade && <div className="flex items-center gap-2"><dt className="text-ti-muted">통합 대기</dt><dd className="m-0"><Pill tone={airTone(l.grade)}>{l.grade}</Pill></dd></div>}
          </dl>
        </div>
      )}

      {(l.pm10 != null || l.pm25 != null) && (
        <dl className="m-0 grid grid-cols-2 gap-3">
          {[
            { label: "미세먼지", v: l.pm10, g: pm10g },
            { label: "초미세먼지", v: l.pm25, g: pm25g },
          ].map((m) => (
            <div key={m.label} className="rounded-[14px] bg-ti-sunk p-4">
              <dt className="flex flex-wrap items-center justify-between gap-1.5 font-semibold text-ti-ink2">
                {m.label}
                {m.g && <Pill tone={airTone(m.g)}>{m.g}</Pill>}
              </dt>
              <dd className="m-0 mt-1.5">
                <span className="font-display text-[2rem] font-semibold tabular-nums text-ti-ink">{m.v ?? "—"}</span>
                <span className="ml-1 text-[0.95rem] text-ti-muted">㎍/㎥</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {(l.pm10 != null || l.pm25 != null) && (
        <p className="text-[0.9rem] text-ti-ink2">숫자가 <b>낮을수록</b> 깨끗합니다. 초미세먼지는 더 작아 폐 깊숙이 들어갑니다.</p>
      )}
    </section>
  );
}

// ── 한눈에 — 자외선·주말 관광 수요·산불 위험·축제 ──
const DEMAND_TONE: Record<DemandForecast["level"], Tone> = { 매우높음: "bad", 높음: "warn", 보통: "ok", 낮음: "good", 매우낮음: "plain" };
const UV_TONE: Record<string, Tone> = { 낮음: "good", 보통: "ok", 높음: "warn", 매우높음: "bad", 위험: "bad" };
const FIRE_TONE: Record<FireBoardView["level"], Tone> = { 낮음: "good", 보통: "ok", 높음: "warn", 매우높음: "bad" };

export function Glance({ metrics, fire, festivalCount }: { metrics: ReportMetrics; fire: FireBoardView | null; festivalCount: number }) {
  const cells: Array<{ label: string; value: React.ReactNode; sub?: string }> = [];
  const d = metrics.tourism.demand;
  if (d?.available) cells.push({ label: "이번 주말 관광 수요", value: <><span className="font-display text-[2rem] font-semibold tabular-nums">{d.index}</span><span className="ml-1 text-ti-muted">/ 100</span> <Pill tone={DEMAND_TONE[d.level]}>{d.level}</Pill></> });
  if (metrics.uv?.todayMax != null) cells.push({ label: "오늘 자외선", value: <Pill tone={UV_TONE[metrics.uv.level] ?? "plain"}>{metrics.uv.level}</Pill>, sub: `지수 ${metrics.uv.todayMax}${metrics.uv.peakHour ? ` · 가장 센 때 ${metrics.uv.peakHour}` : ""}` });
  if (fire?.available) cells.push({ label: "산불 위험", value: <Pill tone={FIRE_TONE[fire.level]}>{fire.level}</Pill>, sub: fire.reasons.slice(0, 2).join(" · ") || undefined });
  if (festivalCount > 0) cells.push({ label: "진행·예정 축제", value: <><span className="font-display text-[2rem] font-semibold tabular-nums">{festivalCount}</span><span className="ml-1 text-ti-muted">건</span></> });
  if (!cells.length) return null;
  return (
    <section aria-labelledby="glance-title">
      <h2 id="glance-title" className="sr-only">한눈에 보기</h2>
      <dl className={`m-0 grid gap-px overflow-hidden rounded-[14px] border border-ti-line bg-ti-line sm:grid-cols-2 ${cells.length >= 4 ? "lg:grid-cols-4" : cells.length === 3 ? "lg:grid-cols-3" : ""}`}>
        {cells.map((c) => (
          <div key={c.label} className="min-w-0 bg-ti-surface px-5 py-4">
            <dt className="font-semibold text-ti-muted">{c.label}</dt>
            <dd className="m-0 mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-ti-ink">{c.value}</dd>
            {c.sub && <dd className="m-0 mt-1 text-[0.9rem] text-ti-ink2">{c.sub}</dd>}
          </div>
        ))}
      </dl>
      <Trends trends={metrics.trends} />
    </section>
  );
}

/** 지난주와 비교 — 화살표만이 아니라 '늘었음/줄었음'을 글로. */
function Trends({ trends }: { trends: ReportMetrics["trends"] }) {
  if (!trends) return null;
  const rows: Array<{ label: string; unit: string; t: TrendItem }> = [];
  if (trends.demand) rows.push({ label: "관광 수요", unit: "", t: trends.demand });
  if (trends.interest) rows.push({ label: "검색 관심도", unit: "%", t: trends.interest });
  if (trends.pm10) rows.push({ label: "미세먼지", unit: "", t: trends.pm10 });
  if (trends.temp) rows.push({ label: "기온", unit: "℃", t: trends.temp });
  if (!rows.length) return null;
  return (
    <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.95rem] text-ti-ink2">
      <span className="font-semibold text-ti-muted">지난주와 비교</span>
      {rows.map(({ label, unit, t }) => (
        <span key={label}>
          {label}{" "}
          <b className="tabular-nums text-ti-ink">
            {t.delta === 0 ? "같음" : `${t.delta > 0 ? "▲" : "▼"} ${Math.abs(t.delta)}${unit} ${t.delta > 0 ? "늘었음" : "줄었음"}`}
          </b>
        </span>
      ))}
    </p>
  );
}

// ── 미세먼지 예보 — 표 대신 날짜별 카드 ──
export function DustForecast({ dust }: { dust: DustBoardView | null }) {
  if (!dust || !dust.days.length) return null;
  const label = (i: number) => (i === 0 ? "오늘" : i === 1 ? "내일" : "모레");
  return (
    <Card labelledBy="dust-title">
      <CardTitle id="dust-title" aside={<span className="text-[0.9rem] text-ti-muted">{dust.city}</span>}>미세먼지 예보</CardTitle>
      <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 md:grid-cols-3">
        {dust.days.slice(0, 3).map((d, i) => (
          <li key={d.date} className="rounded-[12px] bg-ti-sunk p-3.5">
            <p className="font-bold text-ti-ink">{label(i)}</p>
            <dl className="m-0 mt-2 grid gap-1.5">
              <div className="flex items-center justify-between gap-2"><dt className="text-ti-ink2">미세먼지</dt><dd className="m-0">{d.pm10 ? <Pill tone={airTone(d.pm10)}>{d.pm10}</Pill> : "—"}</dd></div>
              <div className="flex items-center justify-between gap-2"><dt className="text-ti-ink2">초미세먼지</dt><dd className="m-0">{d.pm25 ? <Pill tone={airTone(d.pm25)}>{d.pm25}</Pill> : "—"}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      {dust.days[0]?.overall && <p className="mt-3 text-[0.95rem] text-ti-ink2">{dust.days[0].overall}</p>}
      <Source>에어코리아 예보</Source>
    </Card>
  );
}

// ── 산불 위험 — 높을 때만 따로 크게(평소엔 '한눈에'의 한 칸) ──
export function FireWarning({ fire }: { fire: FireBoardView | null }) {
  if (!fire || (fire.level !== "높음" && fire.level !== "매우높음")) return null;
  const red = fire.level === "매우높음";
  return (
    <Card labelledBy="fire-title" className={red ? "border-2 border-[#B3261E]" : "border-2 border-[#9A5B00]"}>
      <CardTitle id="fire-title" aside={<Pill tone={red ? "bad" : "warn"}>{fire.level}</Pill>}>산불 위험</CardTitle>
      {fire.reasons.length > 0 && <p className="mt-2 text-ti-ink2">{fire.reasons.join(" · ")}</p>}
      <p className="mt-2 text-ti-ink">건조·강풍으로 산불이 번지기 쉽습니다. 논밭두렁·쓰레기 태우기 금지, 산에 갈 때 불씨 조심.</p>
    </Card>
  );
}

// ── 주말 관광 수요 ──
function daySky(w: DemandForecast["weather"]["sat"]): string {
  if (!w) return "";
  return [w.sky, w.tmax != null ? `최고 ${w.tmax}℃` : null, w.pop != null ? `비 올 확률 ${w.pop}%` : null].filter(Boolean).join(" · ");
}
export function DemandCard({ demand }: { demand: DemandForecast | null }) {
  if (!demand || !demand.available) return null;
  const pct = Math.max(2, Math.min(100, demand.index));
  const factors = [...demand.factors].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 5);
  return (
    <Card labelledBy="demand-title">
      <CardTitle id="demand-title" aside={<Pill tone={DEMAND_TONE[demand.level]}>{demand.level}</Pill>}>이번 주말 관광 수요</CardTitle>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <p className="font-display text-[2.6rem] font-semibold leading-none tabular-nums text-ti-ink">
          {demand.index}<span className="ml-1 font-sans text-[1rem] font-medium text-ti-muted">/ 100</span>
        </p>
        <div className="min-w-[10rem] flex-1">
          <div className="h-3 overflow-hidden rounded-full bg-ti-sunk" aria-hidden="true">
            <i className="block h-full rounded-full bg-ti-petrol" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[0.85rem] text-ti-muted" aria-hidden="true"><span>한산</span><span>보통</span><span>붐빔</span></div>
        </div>
      </div>
      <p className="mt-3 text-[1.02rem] font-semibold text-ti-ink">{demand.headline}</p>
      {(demand.weather.sat || demand.weather.sun) && (
        <dl className="m-0 mt-3 grid gap-2 md:grid-cols-2">
          {demand.weather.sat && <div className="rounded-[12px] bg-ti-sunk px-3.5 py-2.5"><dt className="inline font-bold">토요일 </dt><dd className="m-0 inline text-ti-ink2">{daySky(demand.weather.sat)}</dd></div>}
          {demand.weather.sun && <div className="rounded-[12px] bg-ti-sunk px-3.5 py-2.5"><dt className="inline font-bold">일요일 </dt><dd className="m-0 inline text-ti-ink2">{daySky(demand.weather.sun)}</dd></div>}
        </dl>
      )}
      {factors.length > 0 && (
        <>
          <h4 className="mt-4 font-semibold text-ti-muted">무엇이 수요를 움직였나</h4>
          <ul className="m-0 mt-1.5 grid list-none gap-1.5 p-0">
            {factors.map((f, i) => (
              <li key={i} className="flex gap-3">
                <span className={`w-10 shrink-0 text-right font-bold tabular-nums ${f.effect >= 0 ? "text-[#0F4D2E]" : "text-[#8A1C14]"}`}>
                  {f.effect >= 0 ? "+" : "−"}{Math.abs(f.effect)}
                </span>
                <span className="text-ti-ink"><b className="font-semibold">{f.label}</b>{f.detail ? <span className="text-ti-ink2"> — {f.detail}</span> : null}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Source>기상청 단기예보·공휴일·관광공사 자료로 계산한 추정치(참고용)</Source>
    </Card>
  );
}

// ── 꽃·단풍 ──
const BLOOM_TONE: Record<string, Tone> = { 만개: "bad", 개화중: "warn", 절정지남: "plain", 개화전: "good", 종료: "plain" };
export function BloomList({ bloom }: { bloom: BloomBoardView | null }) {
  if (!bloom || (!bloom.active.length && !bloom.upcoming.length)) return null;
  return (
    <Card labelledBy="bloom-title">
      <CardTitle id="bloom-title">꽃·단풍 소식</CardTitle>
      {bloom.active.length > 0 && (
        <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 md:grid-cols-2">
          {bloom.active.map((b) => (
            <li key={b.name} className="rounded-[12px] bg-ti-sunk p-3.5">
              <p className="flex flex-wrap items-center justify-between gap-2 font-bold text-ti-ink">{b.name}<Pill tone={BLOOM_TONE[b.status] ?? "plain"}>{b.status}</Pill></p>
              <p className="mt-1 text-[0.95rem] text-ti-ink2">{b.place}</p>
            </li>
          ))}
        </ul>
      )}
      {bloom.upcoming.length > 0 && (
        <p className="mt-3 text-ti-ink2">
          <b className="text-ti-ink">곧 만개</b>{" "}
          {bloom.upcoming.map((b, i) => (
            <span key={b.name}>{i > 0 ? " · " : ""}{b.name} <b className="tabular-nums text-ti-ink">{b.daysToPeak}일 뒤</b></span>
          ))}
        </p>
      )}
      <Source>평년 개화 시기 기준 — 그해 기온에 따라 며칠 달라집니다.</Source>
    </Card>
  );
}

// ── 축제·행사 — 태안군 큐레이션(규모) + 관광공사 등록 행사 ──
const IMPACT_TONE: Record<FestivalView["impact"], Tone> = { 대형: "warn", 중형: "ok", 소형: "plain" };
const mdKo = (m: number, d: number) => `${m}월 ${d}일`;
function ymd8Ko(s: string): string {
  return s.length === 8 ? mdKo(Number(s.slice(4, 6)), Number(s.slice(6, 8))) : s;
}
export function Festivals({ festivals, tour }: { festivals: FestivalView[]; tour: ReportMetrics["tourism"] }) {
  const curated = festivals.slice(0, 6);
  const curatedNames = new Set(curated.map((f) => f.name.replace(/\s/g, "")));
  const extra = tour.festivals.filter((f) => !curatedNames.has(f.title.replace(/\s/g, ""))).slice(0, 6);
  if (!curated.length && !extra.length) return null;
  return (
    <Card labelledBy="fest-title">
      <CardTitle id="fest-title">축제·행사</CardTitle>
      {curated.length > 0 && (
        <ul className="m-0 mt-3 grid list-none gap-0 divide-y divide-ti-line p-0">
          {curated.map((f) => {
            const [, sm, sd] = f.nextStart.split("-").map(Number);
            return (
              <li key={f.key} className="flex flex-col gap-1 py-2.5 md:flex-row md:items-center md:gap-3">
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-ti-ink2 md:w-[11rem]">{mdKo(sm, sd)} ~ {mdKo(f.to[0], f.to[1])}</span>
                <span className="min-w-0 flex-1 font-semibold text-ti-ink">
                  {f.name} <span className="font-normal text-ti-muted">{f.area}</span> <Pill tone={IMPACT_TONE[f.impact]}>{f.impact}</Pill>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {extra.length > 0 && (
        <>
          <h4 className="mt-4 font-semibold text-ti-muted">관광공사에 등록된 행사</h4>
          <ul className="m-0 mt-1 grid list-none gap-0 divide-y divide-ti-line p-0">
            {extra.map((f, i) => (
              <li key={i} className="flex flex-col gap-1 py-2.5 md:flex-row md:gap-3">
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-ti-ink2 md:w-[11rem]">{ymd8Ko(f.start)} ~ {ymd8Ko(f.end)}</span>
                <span className="min-w-0 flex-1 text-ti-ink">{f.title}{f.addr ? <span className="text-ti-muted"> · {f.addr}</span> : null}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Source>대형 축제 주말은 방문이 크게 늘어납니다 · 태안군 문화관광·한국관광공사</Source>
    </Card>
  );
}

// ── 기사 목록(최신 / 역대 오늘) ──
export function ArticleList({ id, title, note, items, more }: {
  id: string; title: string; note?: string;
  items: Array<{ key: number; href: string; meta: string; title: string }>;
  more: { href: string; label: string };
}) {
  if (!items.length) return null;
  return (
    <section aria-labelledby={id} className="min-w-0">
      <SecHead id={id} title={title} note={note} />
      <ul className="m-0 grid list-none gap-0 divide-y divide-ti-line p-0">
        {items.map((it) => (
          <li key={it.key}>
            <Link href={it.href} className="group flex items-baseline gap-4 py-3">
              <span className="w-[5.5rem] shrink-0 text-[0.9rem] font-semibold tabular-nums text-ti-petrol-ink">{it.meta}</span>
              <span className="flex-1 text-[1.02rem] leading-snug text-ti-ink group-hover:underline group-hover:underline-offset-4">{it.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={more.href} className="mt-3 inline-block font-bold text-ti-petrol-ink underline underline-offset-4">{more.label}</Link>
    </section>
  );
}
