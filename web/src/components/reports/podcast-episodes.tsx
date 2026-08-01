"use client";

// 지난 주간 팟캐스트 다시듣기 — 팟캐스트(-gem)가 있는 발행 회차를 나열, 회차별 인라인 플레이어.
//   WebAudio는 재생 클릭 시에만 로드하므로 여러 회차를 나열해도 가볍다(503은 '준비 중'으로 처리).

import { useEffect, useState } from "react";

import { WebAudio } from "@/components/web-audio";
import { listPodcastEpisodes, type PodcastEpisode } from "@/lib/api/reports";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

function weekLabel(weekId: string): string {
  const m = weekId.match(/^(\d{4})-W(\d{2})$/);
  return m ? `${m[1]}년 ${Number(m[2])}주차` : weekId;
}

export function PodcastEpisodes({ excludeWeekId }: { excludeWeekId?: string } = {}) {
  const [eps, setEps] = useState<PodcastEpisode[] | null>(null);
  useEffect(() => {
    let alive = true;
    listPodcastEpisodes().then((e) => { if (alive) setEps(e); }).catch(() => { if (alive) setEps([]); });
    return () => { alive = false; };
  }, []);

  const list = (eps ?? []).filter((e) => e.weekId !== excludeWeekId);
  if (!eps || list.length === 0) return null;

  return (
    <section className="no-print rounded-2xl border border-brand/10 bg-background p-5 shadow-card">
      <h2 className="text-lg font-bold text-brand">🎙 지난 팟캐스트 다시듣기</h2>
      <p className="mt-0.5 text-xs text-foreground-muted">발행된 주간 리포트의 대담 팟캐스트를 회차별로 다시 들을 수 있어요. · AI 생성</p>
      <ul className="mt-4 divide-y divide-brand/10">
        {list.map((e) => (
          <li key={e.weekId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-brand">{weekLabel(e.weekId)}</p>
              {e.summary && <p className="mt-0.5 line-clamp-1 text-xs text-foreground-muted">{e.summary}</p>}
            </div>
            <WebAudio url={`${API_BASE}/api/audio/podcast/${e.weekId}`} event="podcast_archive" variant="inline" />
          </li>
        ))}
      </ul>
    </section>
  );
}
