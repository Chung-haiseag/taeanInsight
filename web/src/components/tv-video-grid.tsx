"use client";

// 태안군TV 클릭-투-플레이 그리드 — 썸네일 클릭 시 그 자리에서 유튜브 임베드 재생(자체 서버 경유 없음).
// /news 태안군TV 탭과 /live 섹션이 공용.

import { useState } from "react";

export interface TvGridVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt?: string;
  description?: string;
}

export function TvVideoGrid({ videos, columns = 2, compact = false }: {
  videos: TvGridVideo[];
  columns?: 2 | 3;
  compact?: boolean; // true면 제목만(발행일·발췌·원문링크 생략) — /live 미니 카드용
}) {
  const [playing, setPlaying] = useState<string | null>(null);

  return (
    <div className={columns === 3 ? "grid gap-4 sm:grid-cols-3" : "grid gap-6 sm:grid-cols-2"}>
      {videos.map((v) => (
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
                <span className={`flex items-center justify-center rounded-full bg-black/60 text-white ${compact ? "h-10 w-10 text-sm" : "h-14 w-14 text-2xl"}`} aria-hidden>▶</span>
              </span>
            </button>
          )}
          {compact ? (
            <figcaption className="bg-background p-3">
              <p className="text-sm font-semibold leading-snug text-brand">{v.title}</p>
            </figcaption>
          ) : (
            <figcaption className="space-y-1 bg-background p-4">
              {v.publishedAt && <p className="text-xs text-foreground-muted">{formatTvDate(v.publishedAt)}</p>}
              <p className="font-bold leading-snug text-brand">{v.title}</p>
              {v.description && <p className="text-sm text-foreground-muted line-clamp-2">{v.description}</p>}
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="inline-block pt-1 text-xs font-semibold text-accent hover:underline">
                유튜브에서 보기 ↗
              </a>
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

// 극장형 레이아웃 — 큰 플레이어 1개 + 아래 좌우 스크롤 썸네일 스트립. /live 태안군TV 섹션용.
export function TvVideoTheater({ videos }: { videos: TvGridVideo[] }) {
  const [currentId, setCurrentId] = useState<string | null>(videos[0]?.id ?? null);
  const [playing, setPlaying] = useState(false);

  const current = videos.find((v) => v.id === currentId) ?? videos[0];
  if (!current) return null;

  return (
    <div className="space-y-3">
      <figure className="overflow-hidden rounded-2xl border border-brand/15">
        {playing ? (
          <iframe
            key={current.id}
            src={`https://www.youtube-nocookie.com/embed/${current.id}?autoplay=1`}
            title={current.title}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group relative block w-full"
            aria-label={`재생: ${current.title}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.thumbnail} alt="" className="aspect-video w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/35">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-2xl text-white" aria-hidden>▶</span>
            </span>
          </button>
        )}
        <figcaption className="flex items-baseline justify-between gap-3 bg-background px-4 py-3">
          <p className="font-bold leading-snug text-brand">{current.title}</p>
          {current.publishedAt && <p className="shrink-0 text-xs text-foreground-muted">{formatTvDate(current.publishedAt)}</p>}
        </figcaption>
      </figure>

      {/* 좌우 스크롤 선택 스트립 */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1" role="list" aria-label="다른 영상 선택">
        {videos.map((v) => {
          const active = v.id === current.id;
          return (
            <button
              key={v.id}
              type="button"
              role="listitem"
              onClick={() => { setCurrentId(v.id); setPlaying(true); }}
              className={`w-44 shrink-0 overflow-hidden rounded-xl border text-left transition-colors sm:w-52 ${
                active ? "border-accent ring-1 ring-accent" : "border-brand/15 hover:border-brand/40"
              }`}
              aria-pressed={active}
              aria-label={`재생: ${v.title}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" loading="lazy" />
              <span className={`block px-2.5 py-2 text-xs font-semibold leading-snug ${active ? "text-accent" : "text-brand"} line-clamp-2`}>
                {v.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatTvDate(iso: string): string {
  // ISO(UTC 오프셋 포함) → 보는 사람 시간대 기준 "7/9 19:14"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
