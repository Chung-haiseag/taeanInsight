"use client";

// 기사 읽기 추적 — 체류시간 + 최대 스크롤 깊이를 측정해 이탈 시 1회 전송.
// 추가형: 기사 화면에 끼워 넣기만 하면 됨(렌더 영향 없는 빈 컴포넌트).

import { useEffect, useRef } from "react";
import { sendReadingEvent } from "@/lib/api/reading";

export function ReadingTracker({ idxno, category }: { idxno: number; category?: string }) {
  const startRef = useRef<number>(0);
  const maxScrollRef = useRef<number>(0);
  const sentRef = useRef(false);

  useEffect(() => {
    startRef.current = Date.now();
    maxScrollRef.current = 0;
    sentRef.current = false;

    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const pct = scrollable > 0 ? Math.round((doc.scrollTop / scrollable) * 100) : 100;
      if (pct > maxScrollRef.current) maxScrollRef.current = Math.min(100, pct);
    };

    const flush = () => {
      if (sentRef.current) return;
      sentRef.current = true;
      sendReadingEvent({
        idxno,
        category,
        dwellMs: Date.now() - startRef.current,
        scrollPct: maxScrollRef.current,
      });
    };

    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush(); // 다른 기사로 이동(언마운트) 시에도 기록
    };
  }, [idxno, category]);

  return null;
}
