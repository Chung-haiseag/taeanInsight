"use client";

// 도로 실시간 CCTV 플레이어 — 카메라 선택 + HLS 재생.
// 스트림은 HTTPS·CORS 허용(Access-Control-Allow-Origin:*) → hls.js로 모든 브라우저 재생,
// Safari는 네이티브 HLS. 스트림 토큰은 ~120분 유효(서버가 30분마다 갱신).

import { useEffect, useRef, useState } from "react";
import type { CctvCamera } from "@/lib/api/reports";

export function CctvPlayer({ cameras, updatedAt }: { cameras: CctvCamera[]; updatedAt: string | null }) {
  const [idx, setIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState(false);

  const cam = cameras[idx];

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cam) return;
    setErr(false);
    let hls: import("hls.js").default | null = null;
    let cancelled = false;

    (async () => {
      // Safari 등 네이티브 HLS 지원 시 직접
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = cam.url;
        return;
      }
      const Hls = (await import("hls.js")).default;
      if (cancelled) return;
      if (Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 10, liveSyncDurationCount: 3 });
        hls.loadSource(cam.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) setErr(true); });
      } else {
        video.src = cam.url; // 최후 폴백
      }
    })();

    return () => { cancelled = true; if (hls) hls.destroy(); };
  }, [cam]);

  if (cameras.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-brand/15 bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} className="aspect-video w-full bg-black" autoPlay muted playsInline controls />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand">{cam?.name?.replace(/^\[[^\]]+\]\s*/, "") ?? "도로 CCTV"}</p>
        {err && <span className="text-xs text-red-600">재생 오류 — 다른 지점을 선택해 보세요</span>}
      </div>
      {/* 카메라 선택 */}
      <div className="flex flex-wrap gap-1.5">
        {cameras.map((c, i) => (
          <button
            key={c.name + i}
            type="button"
            onClick={() => setIdx(i)}
            aria-pressed={i === idx}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${i === idx ? "bg-brand text-background" : "bg-brand/5 text-foreground-muted hover:bg-brand/10"}`}
          >
            {c.name.replace(/^\[[^\]]+\]\s*태안\s*/, "").replace(/^\[[^\]]+\]\s*/, "")}
          </button>
        ))}
      </div>
      <p className="text-xs text-foreground-muted">
        국가교통정보센터(ITS) 실시간 · 총 {cameras.length}곳
        {updatedAt && ` · 갱신 ${new Date(updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`}
      </p>
    </div>
  );
}
