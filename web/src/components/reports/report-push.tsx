"use client";

// 리포트 발행 알림 구독(Web Push) — 인프라는 기존 notifications/* 재사용.
// 리포트 독자가 한 번에 옵트인할 수 있도록 TTS 옆에 두는 컴팩트 버튼.

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";

type Status = "idle" | "unsupported" | "denied" | "subscribing" | "subscribed";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function ReportPushButton() {
  const [status, setStatus] = useState<Status>("idle");
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setStatus("unsupported"); return; }
    if (Notification.permission === "denied") setStatus("denied");
  }, []);

  async function subscribe() {
    if (!vapid) return;
    setStatus("subscribing");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setStatus(permission === "denied" ? "denied" : "idle"); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) });
      const json = sub.toJSON();
      try {
        await apiFetch("/api/push/subscribe", { method: "POST", body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
      } catch { /* 브라우저 구독은 유지 */ }
      setStatus("subscribed");
    } catch {
      setStatus("idle");
    }
  }

  if (status === "unsupported") return null;
  if (status === "subscribed") {
    return <span className="no-print inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-accent">✅ 발행 알림 켜짐</span>;
  }
  if (status === "denied") {
    return <span className="no-print inline-flex items-center gap-1 px-3 py-2 text-xs text-foreground-muted" title="브라우저 사이트 설정에서 알림을 허용해주세요">🔕 알림 차단됨</span>;
  }
  return (
    <button
      type="button"
      onClick={subscribe}
      disabled={status === "subscribing"}
      className="btn-ghost no-print inline-flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-60"
    >
      <span aria-hidden>🔔</span>
      {status === "subscribing" ? "구독 중…" : "발행 알림 받기"}
    </button>
  );
}
