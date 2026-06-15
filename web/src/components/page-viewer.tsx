"use client";

import { useEffect, useRef, useState } from "react";

// 원본 지면 전체화면 뷰어 — 확대(최대 4배)·축소·드래그 이동. ESC/배경클릭/✕ 닫기.
export function PageViewer({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1); // 1 = 화면 폭맞춤, 최대 4배
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ on: false, x: 0, y: 0, sl: 0, st: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z + 0.25));
      if (e.key === "-") setZoom((z) => Math.max(1, z - 0.25));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden"; // 배경 스크롤 잠금
    // 트랙패드 핀치(=ctrl+휠) 줌 — React 합성 wheel은 passive라 네이티브로 등록
    const el = scrollRef.current;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // 일반 휠은 스크롤(이동), 핀치/ctrl+휠만 줌
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(1, z - Math.sign(e.deltaY) * 0.2)));
    };
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      el?.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={`원본 지면 뷰어 (${label})`}>
      {/* 컨트롤 바 */}
      <div className="flex items-center justify-between gap-3 bg-black/60 px-4 py-2.5 text-white">
        <span className="truncate text-sm">📰 주간태안신문 · {label}</span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setZoom((z) => Math.max(1, z - 0.25))} className="rounded bg-white/15 px-3 py-1.5 text-sm font-bold hover:bg-white/30" aria-label="축소">−</button>
          <span className="w-14 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="rounded bg-white/15 px-3 py-1.5 text-sm font-bold hover:bg-white/30" aria-label="확대">＋</button>
          <button onClick={() => setZoom((z) => (z === 1 ? 2 : 1))} className="ml-1 rounded bg-white/15 px-2.5 py-1.5 text-xs hover:bg-white/30">
            {zoom === 1 ? "200%" : "폭맞춤"}
          </button>
          <button onClick={onClose} className="ml-2 rounded bg-white/15 px-3 py-1.5 text-sm font-bold hover:bg-red-600" aria-label="닫기">✕</button>
        </div>
      </div>
      {/* 지면 영역: 줌=이미지 폭 배율, 드래그/스크롤로 이동 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto overscroll-contain cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          const el = scrollRef.current; if (!el) return;
          drag.current = { on: true, x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const el = scrollRef.current, d = drag.current; if (!d.on || !el) return;
          el.scrollLeft = d.sl - (e.clientX - d.x); el.scrollTop = d.st - (e.clientY - d.y);
        }}
        onPointerUp={() => { drag.current.on = false; }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div style={{ width: `${zoom * 100}%` }} className="mx-auto min-w-full px-0 py-2 transition-[width] duration-150">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`원본 지면 (${label})`} className="w-full select-none" draggable={false} />
        </div>
      </div>
      <p className="bg-black/60 px-4 py-1.5 text-center text-[11px] text-white/70">
        ＋− 확대 · 드래그 이동 · ESC 닫기
      </p>
    </div>
  );
}
