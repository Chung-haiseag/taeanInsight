"use client";

// 화면 아래 '듣는 중' 띠 — 기사로 넘어가도 소리와 함께 따라온다.
//
//   왜 있나: 2026-11-08 사용자 — "회차듣기를 하는동안 기사를 볼 수 있도록 하면 어떨까".
//   회차를 틀고 기사 제목을 누르면 화면이 바뀐다. 소리는 이제 끊기지 않지만(audio/player.ts),
//   **멈출 방법이 없으면** 그것도 고장이다. 그래서 어느 화면에 있든 이 띠가 남아
//   무엇이 나오는지 적고, 멈추고, 자리를 옮기고, 그 화면으로 돌아갈 길을 준다.
//
//   자리 잡는 법: position:sticky 로 **레이아웃 마지막 칸**에 둔다. fixed 가 아니라서
//   맨 아래까지 내려가면 바닥글을 덮지 않고 제 칸에 앉는다(여백을 따로 밀어 줄 필요도 없다).
//
//   진행바를 <input type="range"> 로 둔 이유: 네이티브라 **끌 수 있고 화살표 키로도 움직인다.**
//   예전 <div role="slider"> 는 눌러야만 옮겨졌다 — 키보드로는 못 썼고 손으로 끌 수도 없었다.

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/icon";
import { clock } from "./clock";
import { dockVisible } from "./player";
import { getPlayer } from "./singleton";
import { usePlayerSnapshot } from "./use-player";

export function AudioDock() {
  const snap = usePlayerSnapshot();
  // 끄는 동안엔 재생 위치가 손가락을 따라오게 둔다 — 안 그러면 0.1초마다 흐르는 위치가
  //   끌고 있는 손잡이를 뒤로 잡아당긴다.
  const [drag, setDrag] = useState<number | null>(null);
  const player = getPlayer();

  if (!dockVisible(snap) || !snap.track) return null;

  const { track, st, dur } = snap;
  const playing = st === "playing";
  const pos = drag ?? snap.pos;
  const commit = () => { if (drag !== null) { player.seek(drag); setDrag(null); } };

  return (
    <div
      role="region"
      aria-label="듣는 중"
      className="no-print sticky bottom-0 z-40 border-t border-ti-line bg-ti-surface shadow-[0_-6px_20px_rgba(22,33,58,0.10)]"
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:gap-4">
        {/* 재생·일시정지 — 44px 이상(고령 독자가 손가락으로 정확히 누를 수 있는 크기) */}
        <button
          type="button"
          onClick={() => (playing ? player.pause() : void player.play(track))}
          aria-label={playing ? "일시정지" : "이어 듣기"}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ti-petrol text-ti-on-navy transition-colors hover:bg-ti-petrol-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)]"
        >
          {st === "loading"
            ? <span className="text-[0.62rem] font-bold leading-none">여는 중</span>
            : <Icon name={playing ? "pause" : "play"} size="1.3em" weight="fill" />}
        </button>

        <div className="min-w-0 flex-1">
          {/* 무엇이 나오는지. 제목을 누르면 그 화면으로 돌아간다 — 듣다가 '어디서 나오는 소리지?'
              싶을 때 찾아갈 길이 있어야 한다. */}
          <p className="truncate text-[0.95rem] font-bold text-ti-ink">
            {track.href
              ? <Link href={track.href} className="hover:text-ti-petrol-ink hover:underline">{track.title}</Link>
              : track.title}
          </p>

          <div className="mt-0.5 flex items-center gap-2">
            <span className="w-9 shrink-0 text-right text-[0.72rem] tabular-nums text-ti-muted">{clock(pos)}</span>
            <input
              type="range"
              min={0}
              max={dur > 0 ? dur : 1}
              step={0.5}
              value={Math.min(pos, dur > 0 ? dur : 1)}
              disabled={dur <= 0}
              aria-label="재생 위치"
              onChange={(e) => setDrag(Number(e.currentTarget.value))}
              onPointerUp={commit}
              onKeyUp={commit}
              onBlur={commit}
              className="h-5 min-w-0 flex-1 cursor-pointer accent-[var(--ti-petrol)] disabled:cursor-default disabled:opacity-50"
            />
            <span className="w-9 shrink-0 text-[0.72rem] tabular-nums text-ti-muted">{clock(dur)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => player.close()}
          aria-label="듣기 멈추고 닫기"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ti-muted transition-colors hover:bg-ti-sunk hover:text-ti-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)]"
        >
          <Icon name="close" size="1.1em" weight="bold" />
        </button>
      </div>
    </div>
  );
}
