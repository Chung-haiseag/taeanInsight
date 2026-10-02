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
      <div className="overflow-hidden rounded-[18px] border border-ti-line bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} className="aspect-video w-full bg-black" autoPlay muted playsInline controls aria-label={`도로 실시간 CCTV — ${cam?.name?.replace(/^\[[^\]]+\]\s*/, "") ?? "선택한 지점"} (소리 없음)`} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[1.05rem] font-bold text-ti-ink">{cam?.name?.replace(/^\[[^\]]+\]\s*/, "") ?? "도로 CCTV"}</p>
        {err && <span role="status" className="font-semibold text-[#8A1C14]">재생 오류 — 다른 지점을 골라 보세요</span>}
      </div>
      {/* 카메라 선택 */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="CCTV 지점 고르기">
        {cameras.map((c, i) => (
          <button
            key={c.name + i}
            type="button"
            onClick={() => setIdx(i)}
            aria-pressed={i === idx}
            className={`min-h-11 rounded-full border px-4 text-[0.95rem] font-semibold transition-colors ${i === idx ? "border-ti-navy bg-ti-navy text-ti-on-navy" : "border-ti-line bg-ti-surface text-ti-ink2 hover:border-ti-petrol hover:text-ti-ink"}`}
          >
            {c.name.replace(/^\[[^\]]+\]\s*태안\s*/, "").replace(/^\[[^\]]+\]\s*/, "")}
          </button>
        ))}
      </div>
      <p className="text-[0.9rem] text-ti-muted">
        국가교통정보센터(ITS) 실시간 · 총 {cameras.length}곳
        {updatedAt && ` · 갱신 ${new Date(updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`}
      </p>
    </div>
  );
}
