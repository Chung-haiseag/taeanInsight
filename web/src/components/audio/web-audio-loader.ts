// 진짜로 소리를 내는 쪽 — 브라우저 API 를 쓰는 **유일한** 파일.
//
//   왜 <audio> 요소가 아닌가: 이 환경에서 원격 mp3 를 <audio> 로 스트리밍하면 로드에서
//   멈춘다(stalled). 그래서 fetch → decodeAudioData → AudioBufferSourceNode 로 간다.
//   (2026-07 확인. fetch·decodeAudioData 경로는 정상 동작한다.)
//
//   ⚠ AudioContext 는 **하나만** 만들어 계속 쓴다. 브라우저는 한 탭이 동시에 가질 수 있는
//     AudioContext 수를 제한한다(크롬 6개). 회차 목록처럼 재생기가 여러 줄 있는 화면에서
//     하나씩 만들면 금방 막힌다. 어차피 소리는 한 번에 하나만 난다.
//
//   ⚠ 첫 new AudioContext()/resume() 은 **독자가 누른 그 순간**에 일어나야 한다.
//     브라우저 자동재생 정책이 그렇다 — load() 는 단추 처리기에서 바로 불린다.

import type { Sound, SoundLoader } from "./player";

type Ctor = typeof AudioContext;

function makeSound(ctx: AudioContext, buf: AudioBuffer): Sound {
  let src: AudioBufferSourceNode | null = null;
  /** ctx.currentTime 기준 시작 시각(건너뛴 만큼 당겨 둔다) */
  let startAt = 0;
  /** 멈춘 뒤에도 마지막 자리를 기억 */
  let last = 0;

  const halt = (): void => {
    if (!src) return;
    last = Math.min(ctx.currentTime - startAt, buf.duration);
    src.onended = null;
    try { src.stop(); } catch { /* 이미 끝난 소리 */ }
    src = null;
  };

  return {
    duration: buf.duration,
    start(off, onEnded) {
      // 혹시 울리고 있으면 먼저 끊는다 — 두 소리가 겹치는 일은 없어야 한다.
      halt();
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(ctx.destination);
      s.onended = () => { if (src === s) { src = null; last = buf.duration; onEnded(); } };
      const at = Math.max(0, Math.min(off, buf.duration));
      s.start(0, at);
      src = s;
      startAt = ctx.currentTime - at;
      last = at;
    },
    stop: halt,
    position: () => (src ? Math.min(ctx.currentTime - startAt, buf.duration) : last),
    close() {
      halt();
      // AudioBuffer 는 참조가 끊기면 수거된다. ctx 는 공용이라 닫지 않는다.
    },
  };
}

export function webAudioLoader(): SoundLoader {
  let ctx: AudioContext | null = null;
  return {
    async load(url) {
      const AC: Ctor | undefined = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
      if (!AC) return "error";
      ctx ??= new AC();
      await ctx.resume();
      const r = await fetch(url);
      // 503 은 '아직 안 만들어졌다'는 우리 서버의 약속된 답 — 실패와 구분해 적는다.
      if (r.status === 503) return "unavailable";
      if (!r.ok) return "error";
      return makeSound(ctx, await ctx.decodeAudioData(await r.arrayBuffer()));
    },
  };
}
