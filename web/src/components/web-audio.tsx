"use client";

// 듣기 단추 한 벌 — 소리는 **떠 있는 재생기**가 낸다(components/audio/player.ts).
//
//   ⚠ 2026-11-08 이전엔 이 조각이 소리까지 직접 냈다(AudioContext·버퍼를 제 안에 들고). 그래서
//     화면이 바뀌면 조각이 사라지며 소리도 끊겼다 — 회차를 틀고 기사 제목을 누르면 조용해졌다.
//     이제 이 조각은 **리모컨**이다: 지금 나오는 게 '내 소리'인지(주소가 같은지) 보고
//     단추 모양만 바꾼다. 같은 소리를 가리키는 리모컨이 여러 개여도(본문 단추 + 아래 띠)
//     상태는 한 군데(player)뿐이라 어긋나지 않는다.
//
//   왜 <audio> 요소가 아닌가 / 왜 AudioContext 하나인가는 audio/web-audio-loader.ts 에 적었다.
//   보이는 모양(인라인·카드)은 예전과 같다 — 바뀐 것은 소리를 누가 들고 있느냐다.

import { useEffect, useMemo, useRef, type MouseEvent } from "react";

import { clock, spoken } from "@/components/audio/clock";
import type { Track } from "@/components/audio/player";
import { getPlayer } from "@/components/audio/singleton";
import { usePlayerSnapshot } from "@/components/audio/use-player";
import { Icon } from "@/components/icon";
import { listenLabel } from "@/lib/listen-label";

export function WebAudio({
  url, event, variant = "inline", title, subtitle, onPos, controlsRef, durationHint, nowPlaying, href,
}: {
  url: string; event: string; variant?: "inline" | "card"; title?: string; subtitle?: string;
  /** 재생 위치(초) — 본문 따라읽기 하이라이트가 구독한다. **내 소리일 때만** 알린다. */
  onPos?: (sec: number) => void;
  /** 외부에서 재생을 제어할 수 있게 내부 함수를 실어 보낸다(본문 문장 클릭 → 그 지점부터 듣기). */
  controlsRef?: { current: { seekAndPlay: (sec: number) => void } | null };
  /** 재생 전 길이 안내(초). 음성은 다 받아야 길이를 알 수 있어, 자막이 잰 값을 미리 받아 쓴다. */
  durationHint?: number;
  /** 아래 띠에 적을 이름 — **무엇이 나오는지**. 없으면 단추 제목을 쓴다. */
  nowPlaying?: string;
  /** 이 소리가 딸린 화면. 띠에서 제목을 누르면 여기로 돌아온다. */
  href?: string;
}) {
  const snap = usePlayerSnapshot();
  const player = getPlayer();

  // 지금 나오는 소리가 내 것인가 — 주소로 가린다. 남의 소리가 날 때 내 단추가
  //   '일시정지'로 보이면 안 되고, 내 진행바가 남의 위치를 그려도 안 된다.
  const mine = snap.track?.url === url;
  const st = mine ? snap.st : "idle";
  const pos = mine ? snap.pos : 0;
  const dur = mine ? snap.dur : 0;

  const track = useMemo<Track>(
    () => ({ url, event, title: nowPlaying ?? title ?? "태안 인사이트 듣기", subtitle, href }),
    [url, event, nowPlaying, title, subtitle, href],
  );
  const trackRef = useRef(track);
  trackRef.current = track;

  // 본문 따라읽기에 자리를 알린다 — 내 소리가 아니면 0을 알려 하이라이트를 거둔다.
  //   (회차를 듣는 중에 기사 문장이 엉뚱하게 빛나면 안 된다. 그 자리는 이 기사의 자리가 아니다.)
  const onPosRef = useRef(onPos);
  onPosRef.current = onPos;
  useEffect(() => { onPosRef.current?.(mine ? pos : 0); }, [mine, pos]);

  // 본문 문장 클릭 → 아직 안 틀었으면 그 지점부터 받아 틀고, 틀었으면 그 지점으로 옮긴다.
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = { seekAndPlay: (sec: number) => void player.seekAndPlay(trackRef.current, sec) };
    return () => { if (controlsRef) controlsRef.current = null; };
  }, [controlsRef, player]);

  const onBar = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (dur > 0) player.seek(((e.clientX - rect.left) / rect.width) * dur);
  };

  const playing = st === "playing";
  const loadingFirst = st === "loading" && dur === 0;
  const showBar = dur > 0 && (st === "playing" || st === "paused" || st === "loading");

  const btnClass = variant === "card"
    ? "shrink-0 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-background hover:bg-brand/90 disabled:opacity-60"
    : "inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-subtle/20 px-3 py-1.5 text-sm font-semibold text-brand hover:bg-accent-subtle/40 disabled:opacity-60";

  const button = (
    <button type="button" onClick={() => (playing ? player.pause() : void player.play(track))} disabled={loadingFirst} className={btnClass}>
      {loadingFirst ? "여는 중…"
        : playing ? <span className="inline-flex items-center gap-1.5"><Icon name="pause" weight="fill" /> 일시정지</span>
        : st === "paused" ? <><Icon name="play" /> 이어 듣기</>
        : st === "error" ? <><Icon name="refresh" /> 다시 듣기</>
        : <><Icon name="speaker" /> {listenLabel(variant, title)}</>}
    </button>
  );

  const bar = showBar ? (
    <div className="flex items-center gap-2 min-w-[160px] flex-1">
      <span className="text-xs tabular-nums text-foreground-muted">{clock(pos)}</span>
      <div onClick={onBar} className="h-1.5 flex-1 rounded-full bg-brand/15 cursor-pointer" role="slider" aria-label="재생 위치" aria-valuenow={Math.round(pos)} aria-valuemax={Math.round(dur)}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${dur ? Math.min(100, (pos / dur) * 100) : 0}%` }} />
      </div>
      <span className="text-xs tabular-nums text-foreground-muted">{clock(dur)}</span>
    </div>
  ) : null;

  const hint = !showBar && st !== "unavailable" && st !== "error" && durationHint
    ? <span className="text-xs text-foreground-muted">{spoken(durationHint)}</span>
    : null;

  const notes = (
    <>
      {/* 없는 음성을 '곧 자동 생성됩니다'라고 적지 않는다 — 옛 기사엔 끝내 안 생긴다
          (생성기는 최신분만 만든다). 약속 대신 사실만 적는다. */}
      {st === "unavailable" && <span className="text-xs text-foreground-muted">🎧 이 음성은 아직 없습니다</span>}
      {st === "error" && <span className="text-xs text-red-600">재생 실패 — 잠시 후 다시 시도하세요.</span>}
    </>
  );

  if (variant === "card") {
    return (
      <section className="no-print rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-subtle/30 to-background p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-bold text-brand">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-foreground-muted">{subtitle}</p>}
          </div>
          {button}
        </div>
        {(showBar || hint || st === "unavailable" || st === "error") && <div className="mt-3 flex flex-wrap items-center gap-2">{bar}{hint}{notes}</div>}
      </section>
    );
  }
  return <div className="flex flex-wrap items-center gap-2">{button}{bar}{hint}{notes}</div>;
}
