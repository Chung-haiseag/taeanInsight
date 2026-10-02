"use client";

// 지금 태안 헤더용 실시간 시계 — KST 기준, 매초 갱신. 하이드레이션 안전(마운트 후 표시).

import { useEffect, useState } from "react";

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short",
});
const TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
});

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // 마운트 전에는 자리만 유지(레이아웃 흔들림 방지)
  return (
    <div className="leading-tight tabular-nums md:text-right" aria-live="off">
      <div className="text-[0.9rem] font-medium text-ti-muted">
        {now ? DATE_FMT.format(now) : " "}
      </div>
      <div className="font-display text-[1.5rem] font-semibold text-ti-ink" suppressHydrationWarning>
        {now ? TIME_FMT.format(now) : " "}
      </div>
    </div>
  );
}
