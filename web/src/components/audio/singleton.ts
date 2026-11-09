// 창 하나에 재생기 하나 — 이 단위(module)가 그 '하나'를 쥐고 있다.
//
//   화면 조각들은 여기서 같은 재생기를 받아 쓴다. Next 의 화면 이동은 JS 단위를 다시 읽지
//   않으므로, 기사로 넘어가도 이 객체와 그 안의 AudioContext 가 그대로 살아 있다.
//   그게 "회차 들으며 기사 읽기"가 되는 이유 전부다.

import { AudioPlayer } from "./player";
import { webAudioLoader } from "./web-audio-loader";
import { trackEvent } from "@/lib/api/reading";

let inst: AudioPlayer | null = null;

export function getPlayer(): AudioPlayer {
  inst ??= new AudioPlayer({
    loader: webAudioLoader(),
    // ⚠ requestAnimationFrame 이 아니라 타이머다. rAF 는 **다른 탭에 가면 멈춘다** —
    //   소리는 계속 나는데 진행바와 본문 따라읽기만 얼어붙는다. 0.1초면 눈에 매끄럽고
    //   60분의 1초마다 화면 전체를 다시 그리는 낭비도 없다.
    ticker: (tick) => { const id = setInterval(tick, 100); return () => clearInterval(id); },
    onPlay: (event) => trackEvent("audio_play", event),
  });
  return inst;
}
