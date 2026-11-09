"use client";

// 지난 회차를 **이번 주 회차를 지우지 않고** 그 아래에 펼친다.
//
//   왜: '다시 듣기'의 줄을 누르면 /reports/<주차> 로 떠나 버렸다. 이번 주 회차가 화면에서
//   사라지고, 돌아오려면 뒤로 가기를 눌러야 한다. 지난 회차를 한 편 들춰 보는 일이
//   **이번 주를 닫는 일**이 되는 게 이상했다.
//   2026-11-10 사용자: "현재 최근 것은 보이는 상태에서 하단에 과거 것을 보이면 되게 해".
//   그래서 위는 그대로 두고 목록 아래에 그 회차를 통째로 펼친다. 머리는 같은 EpisodeHead 다 —
//   복사하면 한쪽만 고쳐지고 두 화면이 서서히 달라진다(지난 회차 화면이 그래서 같은 걸 쓴다).
//
//   정직하게 적는 것들:
//   - 못 불러오면 **그렇게 적는다**. 빈 칸을 펼쳐 놓고 아무 말 안 하지 않는다.
//   - '이 회차 화면에서 보기'를 늘 둔다 — 주소를 나눠 주려면 제 주소가 필요하다.
//
//   ⚠ ESC 로 닫지 않는다. 이 안의 기사 목록은 **읽기 패널**(article-panel.tsx)을 여는데,
//     그 패널도 ESC 를 듣는다. 둘 다 듣게 하면 패널을 닫으려 누른 ESC 가 회차까지 접어 버린다.
//     접는 길은 '닫기' 단추 하나로 둔다.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { EpisodeHead } from "@/components/reports/episode-head";
import { fetchEpisode, type PodcastEpisodeView } from "@/lib/api/reports";

type Load = { st: "loading" } | { st: "ok"; episode: PodcastEpisodeView } | { st: "fail" };

export function EpisodeInline({
  weekId,
  /** 같은 줄을 또 눌렀다 — 주차가 그대로여도 다시 그리 데려가라는 눈금. */
  focusKey,
  onClose,
}: {
  weekId: string;
  focusKey: number;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>({ st: "loading" });
  // 한 번 받은 회차는 들고 있는다 — 앞뒤로 오가며 보는 자리라 매번 다시 받으면 깜빡인다.
  const cache = useRef(new Map<string, PodcastEpisodeView>());
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const hit = cache.current.get(weekId);
    if (hit) { setLoad({ st: "ok", episode: hit }); return; }
    let alive = true;
    setLoad({ st: "loading" });
    fetchEpisode(weekId)
      .then((e) => {
        if (!e) { if (alive) setLoad({ st: "fail" }); return; }
        cache.current.set(weekId, e);
        if (alive) setLoad({ st: "ok", episode: e });
      })
      .catch(() => { if (alive) setLoad({ st: "fail" }); });
    return () => { alive = false; };
  }, [weekId]);

  // 펼쳐지면 그리로 데려간다. 화면 밖 아래에서 조용히 열리면 누른 사람은 아무 일도
  //   안 일어난 줄 안다 — 목록이 긴 화면에서 실제로 그랬다.
  //   움직임을 줄여 달라는 설정은 지킨다(스크롤은 하되 미끄러지지 않는다).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }, [weekId, focusKey]);

  const link = "text-[1rem] text-ti-petrol-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)]";
  const btn = "whitespace-nowrap rounded-full border border-ti-line px-4 py-2 text-[0.95rem] text-ti-ink hover:bg-ti-sunk focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)]";

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label="펼쳐 본 지난 회차"
      className="no-print mt-12 scroll-mt-24 border-t-2 border-ti-ink pt-5 outline-none"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href={`/reports/${weekId}`} className={link}>이 회차 화면에서 보기 →</Link>
        <button type="button" onClick={onClose} className={`${btn} ml-auto`}>닫기 ✕</button>
      </div>

      {load.st === "loading" && <p className="mt-8 text-ti-muted">회차를 불러오는 중입니다…</p>}

      {load.st === "fail" && (
        <p className="mt-8 text-ti-ink2">
          이 회차를 불러오지 못했습니다. 잠시 뒤 다시 눌러 보시거나, 위의 ‘이 회차 화면에서 보기’로 가 보세요.
        </p>
      )}

      {load.st === "ok" && (
        <div className="mt-8">
          <EpisodeHead episode={load.episode} latest={false} embedded />

          {/* 끝을 닫아 준다. 아래엔 이번 주 기준으로 만든 **데이터 분석**이 온다 —
              끝나는 줄 없이 이어지면 그 분석이 지금 펼쳐 본 **지난 주**의 것처럼 읽힌다.
              (지난 회차 화면에 분석을 안 붙이는 것과 같은 이유다.)
              닫기를 위아래로 두 번 두는 것도 일부러다 — 한 회차는 길어서, 끝까지 내려온
              사람을 다시 맨 위로 올려보내지 않는다(고령 독자가 많은 화면이다). */}
          <div className="mt-14 flex flex-wrap items-center gap-x-5 gap-y-2 border-t-2 border-ti-ink pt-5">
            <Link href={`/reports/${weekId}`} className={link}>이 회차 화면에서 보기 →</Link>
            <button type="button" onClick={onClose} className={`${btn} ml-auto`}>닫기 ✕</button>
          </div>
        </div>
      )}
    </section>
  );
}
