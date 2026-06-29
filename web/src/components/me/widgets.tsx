// 내 페이지 위젯 — PRD v1.8 §6 REQ-PRODUCT-005
// 세그먼트별 가시성·정렬은 widget_registry.tsx에서 결정.
// 실데이터: /api/conditions(날씨·대기질) · /api/news · /api/reports · /api/archive · /api/gov
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { AILabelBadge } from "../ai-label-badge";
import { WorkspacePanel } from "./workspace-panel";
import { apiFetch } from "@/lib/api/client";
import type { UserFavorite, UserPreferences } from "@/lib/types";
import { CATEGORY_LABELS, REGION_OPTIONS } from "@/lib/types";

function regionLabel(code: string): string {
  return REGION_OPTIONS.find((r) => r.code === code)?.label ?? code;
}

// ---------- 공용 fetch 훅 (위젯별 자체 로딩·격리: 하나 실패해도 나머지 정상) ----------

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: boolean }>({
    data: null,
    loading: true,
    error: false,
  });
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: false });
    fn()
      .then((d) => alive && setState({ data: d, loading: false, error: false }))
      .catch(() => alive && setState({ data: null, loading: false, error: true }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function WidgetSkeleton({ label }: { label: string }) {
  return (
    <section aria-busy="true">
      <h2 className="text-lg font-bold text-brand mb-3">{label}</h2>
      <div className="animate-pulse grid gap-2 md:grid-cols-2">
        <div className="h-16 rounded-lg bg-brand/5" />
        <div className="h-16 rounded-lg bg-brand/5" />
      </div>
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-foreground-muted border border-dashed border-brand/20 rounded p-4">
      {children}
    </p>
  );
}

function shortDate(s?: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------- API 응답 타입 (백엔드 라우터 매핑) ----------

interface ConditionsResp {
  available: boolean;
  observedAt?: string;
  weather?: { temp: number; humidity: number; sky: string; pty: string };
  air?: { pm10: number; pm25: number; grade: string; station: string; khaiGrade: number };
}
interface NewsItemLite {
  id: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  category: string;
  leadImage?: string | null;
}
interface NewsResp {
  items: NewsItemLite[];
  labels: Record<string, string>;
}
interface ReportLatestResp {
  report: { weekId: string; summary: string; publishedAt: string } | null;
}
interface ArchiveItem {
  idxno: number;
  title: string;
  published_at: string;
  year: number;
  category: string;
  excerpt: string;
  lead_image?: string | null;
}
interface ArchiveResp {
  items: ArchiveItem[];
}
interface GovNotice {
  board_name: string;
  title: string;
  dept: string;
  published_at: string;
  url: string;
  image_url?: string;
}
interface GovResp {
  notices: GovNotice[];
}

// ---------- welcome_banner (B2C 환영 톤) ----------

export function WelcomeBanner({ preferences }: { preferences: UserPreferences }) {
  const regionList = preferences.regions.map(regionLabel).join(" · ");
  return (
    <section aria-labelledby="welcome-heading">
      <h2 id="welcome-heading" className="text-xl font-bold text-brand">
        오늘도 어서 오세요 ☀️
      </h2>
      <p className="text-foreground-muted mt-1">
        관심 지역 <strong className="text-brand">{regionList || "—"}</strong>에 대한 이번 주 핵심을
        정리해 두었습니다.
      </p>
    </section>
  );
}

// ---------- today_conditions (날씨·대기질 — 공공데이터, 전 세그먼트 상단) ----------

export function TodayConditions({ preferences }: { preferences: UserPreferences }) {
  const { data, loading } = useAsync<ConditionsResp>(
    () => apiFetch<ConditionsResp>("/api/conditions/taean"),
    [],
  );
  if (loading) return <WidgetSkeleton label="오늘의 태안" />;
  if (!data?.available || !data.weather) return null; // 키 미설정·장애 시 조용히 숨김

  const w = data.weather;
  const a = data.air;
  const regionList = preferences.regions.map(regionLabel).join(" · ") || "태안";
  const skyEmoji = w.sky?.includes("맑") ? "☀️" : w.sky?.includes("흐") ? "☁️" : "⛅";
  const cards: Array<{ emoji: string; label: string; value: string; sub: string; bg: string }> = [
    { emoji: skyEmoji, label: "기온", value: `${Math.round(w.temp)}°`, sub: w.sky, bg: "bg-amber-50" },
    { emoji: w.pty && w.pty !== "없음" ? "🌧" : "💧", label: "강수", value: w.pty && w.pty !== "없음" ? w.pty : "없음", sub: `습도 ${w.humidity}%`, bg: "bg-sky-50" },
  ];
  if (a) {
    const dust = (a.grade ?? "").includes("나쁨");
    cards.push({ emoji: dust ? "😷" : "🌫", label: "미세먼지", value: a.grade, sub: `PM10 ${a.pm10}`, bg: dust ? "bg-red-50" : "bg-green-50" });
    cards.push({ emoji: "🫧", label: "초미세", value: `${a.pm25}`, sub: "PM2.5 ㎍/㎥", bg: "bg-teal-50" });
  }

  return (
    <section aria-labelledby="today-heading">
      <div className="flex items-center justify-between mb-3">
        <h2 id="today-heading" className="text-lg font-bold text-brand">
          ⛅ 오늘의 {regionList}
        </h2>
        <span className="text-xs text-foreground-muted">기상청·에어코리아</span>
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {cards.map((m) => (
          <article key={m.label} className={`rounded-xl ${m.bg} p-3 text-center`}>
            <p className="text-xl" aria-hidden>{m.emoji}</p>
            <p className="mt-1 text-2xl font-bold text-brand">{m.value}</p>
            <p className="text-xs font-medium text-foreground-muted">{m.label}</p>
            <p className="text-[11px] text-foreground-muted/80">{m.sub}</p>
          </article>
        ))}
      </div>
      <Link href="/live" className="mt-3 inline-block text-xs font-semibold text-accent hover:underline">
        실시간 현황 전체 보기 →
      </Link>
    </section>
  );
}

// ---------- my_news (관심 분야 최신 뉴스) ----------

export function MyNews({ preferences }: { preferences: UserPreferences }) {
  const { data, loading, error } = useAsync<NewsResp>(
    () => apiFetch<NewsResp>("/api/news?limit=40"),
    [],
  );
  const cats = preferences.categories as string[];
  const items = (data?.items ?? []).filter((i) => cats.includes(i.category)).slice(0, 5);
  const labels = data?.labels ?? {};

  if (loading) return <WidgetSkeleton label="내 관심 분야 뉴스" />;

  return (
    <section aria-labelledby="mynews-heading">
      <div className="flex items-center justify-between mb-3">
        <h2 id="mynews-heading" className="text-lg font-bold text-brand">
          📰 내 관심 분야 뉴스
        </h2>
        <Link href="/news" className="text-xs font-semibold text-accent hover:underline">
          전체 →
        </Link>
      </div>
      {error || items.length === 0 ? (
        <EmptyNote>
          관심 분야({preferences.categories.map((c) => CATEGORY_LABELS[c]).join(" · ") || "—"})에
          해당하는 최신 기사가 아직 없습니다. <Link href="/news" className="text-accent hover:underline">태안뉴스 보기</Link>
        </EmptyNote>
      ) : (
        <ul className="divide-y divide-brand/10">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={`/news/${it.id}`} className="group block py-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">
                    {labels[it.category] ?? it.category}
                  </span>
                  <span className="text-foreground-muted">{shortDate(it.publishedAt)}</span>
                </div>
                <p className="mt-1 font-semibold text-brand group-hover:underline line-clamp-2">{it.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- kpi_cards (B2B·B2G 도구 톤 — 내 활동 요약) ----------

export function KpiCards({
  position,
  preferences,
}: {
  position: "top" | "bottom";
  preferences: UserPreferences;
}) {
  const { data: news } = useAsync<NewsResp>(() => apiFetch<NewsResp>("/api/news?limit=40"), []);
  const { data: rep } = useAsync<ReportLatestResp>(
    () => apiFetch<ReportLatestResp>("/api/reports/latest"),
    [],
  );
  const cats = preferences.categories as string[];
  const myNewsCount = (news?.items ?? []).filter((i) => cats.includes(i.category)).length;

  const cards = [
    { label: "관심 지역", value: String(preferences.regions.length), unit: "설정" },
    { label: "관심 분야", value: String(preferences.categories.length), unit: "설정" },
    { label: "내 분야 최신 기사", value: news ? String(myNewsCount) : "…", unit: "주간" },
    { label: "최신 리포트", value: rep?.report ? rep.report.weekId.replace(/^\d{4}-/, "") : "—", unit: "주간" },
  ];

  return (
    <section aria-labelledby="kpi-heading" className={position === "top" ? "" : "pt-2"}>
      <h2 id="kpi-heading" className="text-lg font-bold text-brand mb-3">
        📊 핵심 지표
      </h2>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((m) => (
          <article key={m.label} className="border border-brand/15 rounded-lg p-4 bg-background">
            <p className="text-xs text-foreground-muted">{m.unit}</p>
            <p className="text-3xl font-bold text-brand mt-1">{m.value}</p>
            <p className="text-sm font-semibold text-brand mt-2">{m.label}</p>
          </article>
        ))}
      </div>
      <Link href="/reports#data" className="mt-3 inline-block text-xs font-semibold text-accent hover:underline">
        지역 데이터 분석(추세·CSV) →
      </Link>
    </section>
  );
}

// ---------- favorites_list ----------

const FAVORITE_LABELS_BY_SEGMENT: Record<string, string> = {
  b2c_basic: "내 즐겨찾기 명소",
  b2c_premium: "내 즐겨찾기 명소",
  b2b_basic: "내 상권·고객 즐겨찾기",
  b2b_premium: "내 상권·고객 즐겨찾기",
  b2g: "내 정책 자료 즐겨찾기",
};

export function FavoritesList({
  segment,
  favorites,
}: {
  segment: UserPreferences["segment"];
  favorites: UserFavorite[];
}) {
  const heading = FAVORITE_LABELS_BY_SEGMENT[segment] ?? "내 즐겨찾기";
  return (
    <section aria-labelledby="favs-heading">
      <h2 id="favs-heading" className="text-lg font-bold text-brand mb-3">
        ⭐ {heading}
      </h2>
      {favorites.length === 0 ? (
        <EmptyNote>
          아직 즐겨찾기가 없습니다. 관심 있는 명소·이벤트를 저장해 두면 여기에 모입니다.
        </EmptyNote>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {favorites.map((f) => (
            <li
              key={f.id}
              className="border border-brand/15 rounded p-3 bg-background flex items-center justify-between"
            >
              <div>
                <p className="font-semibold text-brand">{f.label ?? f.refId}</p>
                <p className="text-xs text-foreground-muted capitalize">{f.kind}</p>
              </div>
              <span className="text-xs text-foreground-muted">
                {new Date(f.createdAt).toLocaleDateString("ko-KR")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- personalized_report (Premium+ 노출 — 최신 리포트 요약) ----------

export function PersonalizedReport({ preferences }: { preferences: UserPreferences }) {
  const cats = preferences.categories.map((c) => CATEGORY_LABELS[c]).join(" · ");
  const { data, loading } = useAsync<ReportLatestResp>(
    () => apiFetch<ReportLatestResp>("/api/reports/latest"),
    [],
  );
  const report = data?.report;

  return (
    <section aria-labelledby="report-heading" className="-mx-5 -my-5 rounded-2xl border-l-4 border-accent bg-accent-subtle/20 p-5 sm:-mx-6 sm:-my-6 sm:p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 id="report-heading" className="text-lg font-bold text-brand">
          📋 내 맞춤 주간 리포트{report ? ` · ${report.weekId}` : ""}
        </h2>
        <AILabelBadge kind="ai_assisted" />
      </div>
      {loading ? (
        <p className="text-sm text-foreground-muted">불러오는 중…</p>
      ) : report ? (
        <p className="text-foreground-muted text-sm leading-relaxed line-clamp-3">{report.summary}</p>
      ) : (
        <p className="text-foreground-muted text-sm">
          관심 분야 <strong className="text-brand">{cats || "—"}</strong> 기준 주간 리포트가 매주
          금요일 발행됩니다.
        </p>
      )}
      <Link href="/reports" className="inline-block mt-3 text-sm font-semibold text-accent hover:underline">
        {report ? "리포트 전체 보기" : "이번 주 리포트 보기"} →
      </Link>
    </section>
  );
}

// ---------- archive_picks (관심 키워드 아카이브) ----------

export function ArchivePicks({ preferences }: { preferences: UserPreferences }) {
  const q = preferences.categories[0] ? CATEGORY_LABELS[preferences.categories[0]] : "태안";
  const { data, loading } = useAsync<ArchiveResp>(
    () => apiFetch<ArchiveResp>(`/api/archive/search?q=${encodeURIComponent(q)}&limit=4`),
    [q],
  );
  const items = data?.items ?? [];

  if (loading) return <WidgetSkeleton label="관심 키워드 아카이브" />;
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="archive-heading">
      <div className="flex items-center justify-between mb-3">
        <h2 id="archive-heading" className="text-lg font-bold text-brand">
          📜 아카이브에서 · “{q}”
        </h2>
        <Link href="/archive" className="text-xs font-semibold text-accent hover:underline">
          검색 →
        </Link>
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((it) => (
          <li key={it.idxno}>
            <Link
              href={`/news/${it.idxno}`}
              className="group block border border-brand/15 rounded p-3 bg-background h-full"
            >
              <span className="text-xs text-foreground-muted">{it.year}</span>
              <p className="mt-1 text-sm font-semibold text-brand group-hover:underline line-clamp-2">
                {it.title}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- gov_notices (태안군청 군정 소식) ----------

export function GovNotices() {
  const { data, loading } = useAsync<GovResp>(
    () => apiFetch<GovResp>("/api/gov/recent?limit=5"),
    [],
  );
  const items = data?.notices ?? [];

  if (loading) return <WidgetSkeleton label="태안군청 군정 소식" />;
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="gov-heading">
      <h2 id="gov-heading" className="text-lg font-bold text-brand mb-3">
        🏛 태안군청 군정 소식
      </h2>
      <ul className="divide-y divide-brand/10">
        {items.map((n, i) => (
          <li key={`${n.url}-${i}`}>
            <a
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block py-3"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">
                  {n.board_name}
                </span>
                <span className="text-foreground-muted">{shortDate(n.published_at)}</span>
                {n.dept && <span className="text-foreground-muted">· {n.dept}</span>}
              </div>
              <p className="mt-1 text-sm font-semibold text-brand group-hover:underline line-clamp-2">
                {n.title}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- team_workspace (B2B) / b2g_department_space (B2G) ----------
// 공유 코드 워크스페이스(멤버·공유자료·공유메모) — components/me/workspace-panel.tsx

export function TeamWorkspace() {
  return <WorkspacePanel kind="team" />;
}

export function B2gDepartmentSpace() {
  return <WorkspacePanel kind="dept" />;
}

// ---------- usage_panel ----------

export function UsagePanel({ preferences }: { preferences: UserPreferences }) {
  return (
    <section aria-labelledby="usage-heading">
      <h2 id="usage-heading" className="text-sm font-semibold text-brand mb-2">
        구독 · 사용량
      </h2>
      <dl className="grid gap-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-foreground-muted">플랜</dt>
          <dd className="text-brand">{preferences.segment}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground-muted">관심 지역</dt>
          <dd>{preferences.regions.length}개</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground-muted">관심 분야</dt>
          <dd>{preferences.categories.length}개</dd>
        </div>
      </dl>
    </section>
  );
}
