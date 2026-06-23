"use client";

// 사장님 맞춤 홈 — 가게 프로필(업종·읍면) + 실데이터(수요지수·날씨·물때·상권)로
// 매출 결정에 직결되는 예측·실행 제안. 미리보기(blurred)는 정적 샘플, 구독자는 실데이터.

import { useEffect, useState } from "react";
import Link from "next/link";

import { PushOptInButton } from "@/components/me/push_opt_in";
import { DemandGauge } from "@/components/reports/report-charts";
import { REGION_OPTIONS } from "@/lib/types";
import {
  fetchOwnerBrief, updateShopProfile, INDUSTRY_OPTIONS,
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

// ── 가게 프로필 설정 ──
function ShopSetup({ onSaved }: { onSaved: () => void }) {
  const [industry, setIndustry] = useState<ShopIndustry | null>(null);
  const [eupMyeon, setEupMyeon] = useState<string>("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!industry) { setErr("업종을 선택하세요."); return; }
    setSaving(true); setErr(null);
    try {
      const r = await updateShopProfile({ industry, eupMyeon: eupMyeon || undefined, name: name || undefined });
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
