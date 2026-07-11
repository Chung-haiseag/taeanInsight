"use client";

// 태안뉴스 — 주간태안신문 RSS를 수집해 플랫폼 도메인으로 분류한 피드.
// 발췌 + 원문 링크(저작권 안전). 카테고리 탭 필터.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

import { getNews, getTvNews, type NewsResponse, type TvNewsResponse } from "@/lib/api/news";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icon";

const CATEGORY_ORDER = ["tourism", "environment", "industry", "policy", "realestate", "culture", "society"];

export default function NewsPage() {
  const [data, setData] = useState<NewsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string>("all");
  const [tv, setTv] = useState<TvNewsResponse | null>(null);
  const [tvError, setTvError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setData(await getNews());
      } catch (e) {
        setError(e instanceof Error ? e.message : "뉴스를 불러오지 못했습니다");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 태안군TV 탭은 첫 진입 시에만 로드(유튜브 RSS 패스스루 — 서버 저장 없음)
  useEffect(() => {
    if (active !== "tv" || tv || tvError) return;
    (async () => {
      try {
        setTv(await getTvNews());
      } catch (e) {
        setTvError(e instanceof Error ? e.message : "영상을 불러오지 못했습니다");
      }
    })();
  }, [active, tv, tvError]);

  const items = useMemo(() => {
    if (!data) return [];
    return active === "all" ? data.items : data.items.filter((i) => i.category === active);
  }, [data, active]);

  const interests = useMemo(() => new Set(data?.interests ?? []), [data]);

  const tabs = useMemo(() => {
    if (!data) return [];
    const avail = CATEGORY_ORDER.filter((c) => (data.counts[c] ?? 0) > 0);
    // 관심 분야 탭을 앞으로
    return [...avail].sort((a, b) => Number(interests.has(b)) - Number(interests.has(a)));
  }, [data, interests]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Taean News"
        title="태안뉴스"
        description={<>{data?.source ?? "주간태안신문"}의 최신 기사를 관심 도메인별로 모았습니다. 제목·발췌만 보여드리며, 원문은 태안신문에서 확인하세요.</>}
      />

      {loading && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
      {error && (
        <p className="text-sm text-red-600 border border-red-200 rounded-lg p-4 bg-red-50">⚠️ {error}</p>
      )}

      {data && (
        <>
          {data.personalized && data.interests?.length ? (
            <div className="flex items-center gap-2 rounded-xl bg-accent-subtle/30 px-4 py-2.5 text-sm">
              <Icon name="star" />
              <span className="text-brand">
                <strong>{data.interests.map((c) => data.labels[c] ?? c).join("·")}</strong> 관심사 기사를 먼저 보여드려요
              </span>
            </div>
          ) : null}

          {/* 카테고리 탭 */}
          <div className="flex flex-wrap gap-2 border-b border-brand/10 pb-3">
            <Tab label={`전체 ${data.total}`} active={active === "all"} onClick={() => setActive("all")} />
            {tabs.map((c) => (
              <Tab
                key={c}
                label={<>{interests.has(c) ? <><Icon name="star" /> </> : null}{data.labels[c]} {data.counts[c]}</>}
                active={active === c}
                onClick={() => setActive(c)}
              />
            ))}
            <Tab label={<>📺 태안군TV</>} active={active === "tv"} onClick={() => setActive("tv")} />
          </div>

          {/* 태안군TV 영상 — 유튜브 직접 재생(콘텐츠 미저장) */}
          {active === "tv" ? (
            <TvVideoSection tv={tv} error={tvError} />
          ) : (
            <>
          {/* 기사 리스트 — 클릭 시 자체 리더로 */}
          <ul className="divide-y divide-brand/10">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/news/${it.id}`}
                  className="group flex gap-4 py-5 transition-colors hover:bg-brand/[0.02] -mx-3 px-3 rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">
                      {data.labels[it.category]}
                    </span>
                    <span className="text-foreground-muted">{formatDate(it.publishedAt)}</span>
                    {it.author && <span className="text-foreground-muted">· {it.author}</span>}
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-brand group-hover:underline">
                    {it.title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-foreground-muted line-clamp-2">{it.excerpt}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand">
                    읽기 <span aria-hidden="true">→</span>
                  </span>
                  </div>
                  {it.leadImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.leadImage}
                      alt=""
                      className="hidden h-24 w-32 shrink-0 self-center rounded-lg object-cover bg-brand/5 sm:block"
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <p className="text-xs text-foreground-muted">
            출처: {data.source} · 10분마다 갱신 · AI 자동 분류(휴리스틱) · 전문은 회원 전용
          </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

// 태안군TV 그리드 — 썸네일 클릭 시 그 자리에서 유튜브 임베드 재생(자체 서버 경유 없음)
function TvVideoSection({ tv, error }: { tv: TvNewsResponse | null; error: string | null }) {
  const [playing, setPlaying] = useState<string | null>(null);

  if (error) {
    return <p className="text-sm text-red-600 border border-red-200 rounded-lg p-4 bg-red-50">⚠️ {error}</p>;
  }
  if (!tv) return <p className="text-sm text-foreground-muted">영상을 불러오는 중…</p>;

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        {tv.items.map((v) => (
          <figure key={v.id} className="overflow-hidden rounded-2xl border border-brand/15">
            {playing === v.id ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1`}
                title={v.title}
                className="aspect-video w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(v.id)}
                className="group relative block w-full"
                aria-label={`재생: ${v.title}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/35">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-2xl text-white" aria-hidden>▶</span>
                </span>
              </button>
            )}
            <figcaption className="space-y-1 bg-background p-4">
              <p className="text-xs text-foreground-muted">{formatTvDate(v.publishedAt)}</p>
              <p className="font-bold leading-snug text-brand">{v.title}</p>
              {v.description && <p className="text-sm text-foreground-muted line-clamp-2">{v.description}</p>}
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="inline-block pt-1 text-xs font-semibold text-accent hover:underline">
                유튜브에서 보기 ↗
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="text-xs text-foreground-muted">
        출처: {tv.source} · 영상은 유튜브에서 직접 재생(자체 저장 없음) ·{" "}
        <a href={tv.channelUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">채널 바로가기 ↗</a>
      </p>
    </>
  );
}

function Tab({ label, active, onClick }: { label: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-brand text-background" : "text-foreground-muted hover:bg-brand/5"
      }`}
    >
      {label}
    </button>
  );
}

function formatTvDate(iso: string): string {
  // ISO(UTC 오프셋 포함) → 보는 사람 시간대 기준 "7/9 19:14"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDate(s: string): string {
  // "2026-06-04 16:57:28" → "6/4 16:57"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/);
  if (!m) return s;
  return `${Number(m[2])}/${Number(m[3])} ${m[4]}`;
}
