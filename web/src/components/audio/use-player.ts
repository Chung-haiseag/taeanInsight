"use client";

// 지금 무엇이 나오는지 화면이 구독하는 창구.

import { useSyncExternalStore } from "react";

import { getPlayer } from "./singleton";
import type { Snapshot } from "./player";

/** 서버에서 그릴 때의 값 — 소리는 브라우저에만 있다(hydration 어긋남 방지). */
const SERVER: Snapshot = { track: null, st: "idle", pos: 0, dur: 0 };

export function usePlayerSnapshot(): Snapshot {
  const p = getPlayer();
  return useSyncExternalStore(p.subscribe, p.get, () => SERVER);
}
