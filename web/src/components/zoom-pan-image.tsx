"use client";

import { useEffect, useRef, useState } from "react";

// 원본 지면 인라인 줌/팬 — 새 창 없이 그 자리에서 확대(최대 4배)·마우스 드래그 이동.
// 확대 시 고해상(fullSrc) 이미지로 교체해 선명하게. fullSrc 미지정 시 src 사용.
export function ZoomPanImage({
  src,
  fullSrc,
  maxHeightClass = "max-h-[32rem]",
}: {
  src: string;
  fullSrc?: string;
  maxHeightClass?: string;
}) {
  const [zoom, setZoom] = useState(1); // 1=폭맞춤, 최대 4배
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ on: false, x: 0, y: 0, sl: 0, st: 0 });
  const imgSrc = zoom > 1 ? (fullSrc ?? src) : src;

  useEffect(() => {
    const el = scrollRef.current;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // 일반 휠은 스크롤(이동), 핀치/ctrl+휠만 줌
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(1, z - Math.sign(e.deltaY) * 0.2)));
    };
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => el?.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <button onClick={() => setZoom((z) => Math.max(1, z - 0.25))} className="rounded bg-foreground-muted/15 px-2.5 py-1 text-sm font-bold hover:bg-foreground-muted/25" aria-label="축소">−</button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="rounded bg-foreground-muted/15 px-2.5 py-1 text-sm font-bold hover:bg-foreground-muted/25" aria-label="확대">＋</button>
        <button onClick={() => setZoom((z) => (z === 1 ? 2 : 1))} className="rounded bg-foreground-muted/15 px-2 py-1 text-xs hover:bg-foreground-muted/25">{zoom === 1 ? "200%" : "폭맞춤"}</button>
        <span className="ml-auto text-[11px] text-foreground-muted">＋−·ctrl+휠 확대 · 드래그 이동</span>
      </div>
      <div
        ref={scrollRef}
        className={`${maxHeightClass} overflow-auto rounded border ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          const el = scrollRef.current; if (!el) return;
          drag.current = { on: true, x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const el = scrollRef.current, d = drag.current; if (!d.on || !el) return;
          el.scrollLeft = d.sl - (e.clientX - d.x); el.scrollTop = d.st - (e.clientY - d.y);
        }}
        onPointerUp={() => { drag.current.on = false; }}
      >
        <div style={{ width: `${zoom * 100}%` }} className="transition-[width] duration-150">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgSrc} alt="원본 지면" className="w-full select-none" draggable={false} loading="lazy" />
        </div>
      </div>
    </div>
  );
}
