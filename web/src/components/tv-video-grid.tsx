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

function formatTvDate(iso: string): string {
  // ISO(UTC 오프셋 포함) → 보는 사람 시간대 기준 "7/9 19:14"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
