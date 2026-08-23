"use client";
import { useEffect, useRef } from "react";

// 목록 화면에서 기사로 들어갔다 뒤로 왔을 때 **보던 자리로 되돌린다**.
//
//   뉴스아카이브에서 이걸 네 번 만에 잡았다. 원인이 넷이었고, 화면만 보면 넷 다
//   똑같이 '맨 위로 감'이라 구분이 안 됐다. 두 번째 목록(옛 광고)에서 같은 고생을
//   반복하지 않으려고 공용으로 뺀다. 아래 네 가지가 그때 배운 것이다:
//
//   ① 뒤로 올 때 브라우저가 위치를 되살리려는 시점엔 목록이 아직 비어 있다(비동기 조회).
//      높이가 0이라 갈 곳이 없다 → 조회가 끝난 뒤 우리가 되돌린다.
//   ② 되돌리는 그 순간에도 페이지가 아직 짧다(사진이 늦게 들어와 2,526px→3,861px).
//      → 높이가 자랄 때까지 짧게 다시 시도한다.
//   ③ 떠날 때 window.scrollY를 읽으면 안 된다. 정리 함수는 이미 다음 화면으로 넘어가
//      맨 위로 간 뒤에 돌아서, 좋은 값을 0으로 덮어쓴다 → 사람이 굴린 마지막 자리를 따로 기억한다.
//   ④ 맥 트랙패드 스와이프로 뒤로 오면 제스처의 잔여 wheel이 '사용자가 손댔다'로 잡혀
//      되살리기가 시작하자마자 취소된다 → 취소 감지를 잠깐 뒤에 켠다.
//
//   ⚠ requestAnimationFrame을 쓰지 않는다. 탭이 뒤에 있거나 화면이 안 그려지는 동안
//     프레임 콜백이 멈춰 저장·되살리기가 통째로 빠진다(실측에서 그렇게 놓쳤다).

/** 저장 열쇠 — 같은 조건으로 돌아왔을 때만 되살려야 한다. 다르면 엉뚱한 자리에 떨어진다. */
export const listScrollKey = (path: string, params: Record<string, string | number | null | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  const qs = p.toString();
  return `scroll:${path}${qs ? `?${qs}` : ""}`;
};

/**
 * 목록 스크롤 기억·되살리기.
 *   @param key   지금 목록 조건의 열쇠(listScrollKey로 만든다)
 *   @param ready 목록이 그려졌는가 — 이게 true가 된 뒤에 되살린다
 */
export function useListScrollMemory(key: string, ready: boolean): void {
  // ── 저장: 사람이 굴린 마지막 자리를 기억했다가 잠깐 모아 적는다 ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const last = { v: Math.round(window.scrollY) };
    let timer = 0;
    const write = () => {
      try { sessionStorage.setItem(key, String(last.v)); } catch { /* 저장 실패는 무시 */ }
    };
    const onScroll = () => {
      last.v = Math.round(window.scrollY);
      if (timer) return;
      timer = window.setTimeout(() => { timer = 0; write(); }, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
      write();   // ③ 떠나는 시점의 scrollY가 아니라 **사람이 굴린 마지막 자리**를 적는다
    };
  }, [key]);

  // ── 되살리기: 목록이 그려진 뒤 한 번만, 높이가 자랄 때까지 다시 시도 ──
  const restored = useRef(false);
  const firstKey = useRef(key);
  useEffect(() => {
    if (restored.current || !ready || typeof window === "undefined") return;
    restored.current = true;
    let y = 0;
    try { y = Number(sessionStorage.getItem(firstKey.current)) || 0; } catch { /* 읽기 실패는 무시 */ }
    if (y <= 0) return;

    let tries = 0, timer = 0, cancelled = false, armed = false;
    const events = ["wheel", "touchstart", "keydown"] as const;
    const stop = () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(armTimer);
      for (const ev of events) window.removeEventListener(ev, onUser);
    };
    // ④ 스와이프 제스처의 잔여 입력은 무시한다 — 바로 켜면 시작하자마자 취소된다.
    const armTimer = window.setTimeout(() => { armed = true; }, 500);
    const onUser = (e: Event) => {
      if (!armed) return;
      if (e.type === "wheel" && Math.abs((e as WheelEvent).deltaY) < 4) return;
      stop();
    };
    for (const ev of events) window.addEventListener(ev, onUser, { passive: true });

    const attempt = () => {
      if (cancelled) return;
      // 'instant' — 부드러운 스크롤이면 애니메이션과 재시도가 서로 싸운다.
      window.scrollTo({ top: y, behavior: "instant" });
      if (Math.abs(window.scrollY - y) > 4 && tries++ < 25) timer = window.setTimeout(attempt, 100);
      else stop();
    };
    timer = window.setTimeout(attempt, 0);
    return stop;
  }, [ready]);
}
