"use client";

// <audio> 요소가 이 환경에서 원격 mp3 스트리밍 로드에 멈추는(stalled) 문제를 우회 —
// fetch → decodeAudioData → Web Audio(AudioBufferSourceNode)로 재생. 커스텀 재생/일시정지/진행바.
// (fetch·decodeAudioData는 실환경에서 정상 동작 확인됨. <audio> 요소 경로만 회피.)

import { useRef, useState, useEffect, useCallback, type MouseEvent } from "react";
import { Icon } from "@/components/icon";
import { trackEvent } from "@/lib/api/reading";

type St = "idle" | "loading" | "playing" | "paused" | "error" | "unavailable";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60), x = Math.floor(s % 60);
  return `${m}:${String(x).padStart(2, "0")}`;
}

/** 사람이 읽는 길이 표기 — "2분 23초". 고령 독자 기준이라 콜론(2:23)보다 말로 쓴다. */
function human(s: number): string {
  const m = Math.floor(s / 60), x = Math.round(s % 60);
  return m ? (x ? `${m}분 ${x}초` : `${m}분`) : `${x}초`;
}

export function WebAudio({ url, event, variant = "inline", title, subtitle, onPos, controlsRef, durationHint }: {
  url: string; event: string; variant?: "inline" | "card"; title?: string; subtitle?: string;
  /** 재생 위치(초) — 본문 따라읽기 하이라이트가 구독한다. 재생 중 rAF마다 호출된다. */
  onPos?: (sec: number) => void;
  /** 외부에서 재생을 제어할 수 있게 내부 함수를 실어 보낸다(본문 문장 클릭 → 그 지점부터 듣기). */
  controlsRef?: { current: { seekAndPlay: (sec: number) => void } | null };
  /** 재생 전 길이 안내(초). 음성은 다 받아야 길이를 알 수 있어, 자막이 잰 값을 미리 받아 쓴다. */
  durationHint?: number;
}) {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startAtRef = useRef(0);   // ctx.currentTime 기준 재생 시작 시각(offset 반영)
  const offsetRef = useRef(0);    // 일시정지/seek 지점(초)
  const rafRef = useRef(0);
  const [st, setSt] = useState<St>("idle");
  const [pos, setPosState] = useState(0);
  // 위치 갱신은 항상 이 함수로 — 화면 표시와 따라읽기 하이라이트가 어긋나지 않게 한 곳에서 통지.
  const onPosRef = useRef(onPos); onPosRef.current = onPos;
  const setPos = (v: number) => { setPosState(v); onPosRef.current?.(v); };
  const [dur, setDur] = useState(0);

  const stopRaf = () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; } };

  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && srcRef.current) {
      setPos(Math.min(ctx.currentTime - startAtRef.current, bufRef.current?.duration ?? 0));
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  // BufferSource는 pause 불가(stop만) → offset 기록 후 새 source를 offset부터 start.
  const startFrom = useCallback((off: number) => {
    const ctx = ctxRef.current!, buf = bufRef.current!;
    const s = ctx.createBufferSource();
    s.buffer = buf; s.connect(ctx.destination);
    s.onended = () => { if (srcRef.current === s) { srcRef.current = null; stopRaf(); offsetRef.current = 0; setPos(0); setSt("idle"); } };
    s.start(0, Math.max(0, Math.min(off, buf.duration)));
    srcRef.current = s; startAtRef.current = ctx.currentTime - off; setSt("playing"); stopRaf(); tick();
  }, [tick]);

  const play = useCallback(async () => {
    try {
      if (!ctxRef.current) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctxRef.current = new AC();
      }
      await ctxRef.current.resume();
      if (!bufRef.current) {
        setSt("loading");
        const r = await fetch(url);
        if (r.status === 503) { setSt("unavailable"); return; }
        if (!r.ok) { setSt("error"); return; }
        bufRef.current = await ctxRef.current.decodeAudioData(await r.arrayBuffer());
        setDur(bufRef.current.duration);
      }
      trackEvent("audio_play", event);
      startFrom(offsetRef.current);
    } catch { setSt("error"); }
  }, [url, event, startFrom]);

  const pause = useCallback(() => {
    const ctx = ctxRef.current, s = srcRef.current;
    if (ctx && s) { offsetRef.current = ctx.currentTime - startAtRef.current; s.onended = null; try { s.stop(); } catch { /* */ } srcRef.current = null; }
    stopRaf(); setSt("paused");
  }, []);

  const seek = useCallback((t: number) => {
    const d = bufRef.current?.duration ?? 0;
    const nt = Math.max(0, Math.min(t, d));
    offsetRef.current = nt; setPos(nt);
    if (srcRef.current) { const s = srcRef.current; s.onended = null; try { s.stop(); } catch { /* */ } srcRef.current = null; startFrom(nt); }
  }, [startFrom]);

  // 본문 문장 클릭 → 아직 안 틀었으면 재생부터 시작하고, 틀었으면 그 지점으로 이동한다.
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      seekAndPlay: (sec: number) => {
        if (!bufRef.current) { offsetRef.current = sec; setPos(sec); void play(); return; }
        seek(sec);
        if (st !== "playing") void play();
      },
    };
    return () => { if (controlsRef) controlsRef.current = null; };
  }, [controlsRef, seek, play, st]);

  useEffect(() => () => { stopRaf(); try { srcRef.current?.stop(); } catch { /* */ } try { ctxRef.current?.close(); } catch { /* */ } }, []);

  const onBar = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (dur > 0) seek(((e.clientX - rect.left) / rect.width) * dur);
  };

  const playing = st === "playing";
  const loadingFirst = st === "loading" && dur === 0;
  const showBar = dur > 0 && (st === "playing" || st === "paused" || st === "loading");

  const btnClass = variant === "card"
    ? "shrink-0 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-background hover:bg-brand/90 disabled:opacity-60"
    : "inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-subtle/20 px-3 py-1.5 text-sm font-semibold text-brand hover:bg-accent-subtle/40 disabled:opacity-60";

  const button = (
    <button type="button" onClick={playing ? pause : play} disabled={loadingFirst} className={btnClass}>
      {loadingFirst ? "여는 중…"
        : playing ? <span className="inline-flex items-center gap-1.5"><span aria-hidden>❙❙</span> 일시정지</span>
        : st === "paused" ? <><Icon name="play" /> 이어 듣기</>
        : st === "error" ? <><Icon name="refresh" /> 다시 듣기</>
        : <><Icon name="speaker" /> {variant === "card" ? "듣기" : "기사 듣기"}</>}
    </button>
  );

  const bar = showBar ? (
    <div className="flex items-center gap-2 min-w-[160px] flex-1">
      <span className="text-xs tabular-nums text-foreground-muted">{fmt(pos)}</span>
      <div onClick={onBar} className="h-1.5 flex-1 rounded-full bg-brand/15 cursor-pointer" role="slider" aria-label="재생 위치" aria-valuenow={Math.round(pos)} aria-valuemax={Math.round(dur)}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${dur ? Math.min(100, (pos / dur) * 100) : 0}%` }} />
      </div>
      <span className="text-xs tabular-nums text-foreground-muted">{fmt(dur)}</span>
    </div>
  ) : null;

  const hint = !showBar && st !== "unavailable" && st !== "error" && durationHint
    ? <span className="text-xs text-foreground-muted">{human(durationHint)}</span>
    : null;

  const notes = (
    <>
      {st === "unavailable" && <span className="text-xs text-foreground-muted">🎧 음성 준비 중 — 곧 자동 생성됩니다</span>}
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
