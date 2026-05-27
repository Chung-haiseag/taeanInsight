"use client";

// W3C Web Push 옵트인 (Firebase 미사용)
// PRD v1.8 §6 REQ-PRODUCT-005

import { useEffect, useState } from "react";

type Status = "unknown" | "unsupported" | "default" | "granted" | "denied" | "subscribing" | "subscribed" | "error";

interface Props {
  vapidPublicKey?: string;
  onSubscribed?: (sub: PushSubscriptionJSON) => void;
}

export function PushOptInButton({ vapidPublicKey, onSubscribed }: Props) {
  const [status, setStatus] = useState<Status>("unknown");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    setStatus(Notification.permission as Status);
  }, []);

  async function subscribe() {
    if (!vapidPublicKey) {
      setError("VAPID 공개키가 설정되지 않았습니다");
      setStatus("error");
      return;
    }
    setStatus("subscribing");
    setError(null);
    try {
      // Service Worker 등록
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 권한 요청
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission as Status);
        return;
      }

      // 구독
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      onSubscribed?.(sub.toJSON());
      setStatus("subscribed");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "구독 실패";
      setError(msg);
      setStatus("error");
    }
  }

  if (status === "unsupported") {
    return (
      <div className="border border-brand/10 rounded p-3 bg-background text-sm text-foreground-muted">
        ⚠️ 이 브라우저는 푸시 알림을 지원하지 않습니다.
        <br />
        <span className="text-xs">iPhone은 Safari 공유 → "홈 화면에 추가" 후 PWA로 실행하면 알림 받을 수 있습니다.</span>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="border border-brand/10 rounded p-3 bg-background text-sm text-foreground-muted">
        🔕 알림이 차단되어 있습니다. 다시 받으려면 브라우저 사이트 설정에서 알림을 허용해주세요.
      </div>
    );
  }

  if (status === "subscribed") {
    return (
      <div className="border border-accent/40 rounded p-3 bg-accent-subtle/40 text-sm text-brand">
        ✅ 적조·기상 특보 알림이 활성화되었습니다.
      </div>
    );
  }

  return (
    <div className="border border-brand/15 rounded p-3 bg-background flex items-center justify-between gap-3">
      <div className="text-sm">
        <p className="font-semibold text-brand">관심 지역 적조·특보 알림 받기</p>
        <p className="text-xs text-foreground-muted">
          무료. 사이트를 닫아둬도 알림이 옵니다. 언제든 끌 수 있어요.
        </p>
      </div>
      <button
        type="button"
        onClick={subscribe}
        disabled={status === "subscribing"}
        className="bg-brand text-background px-4 py-2 rounded text-sm font-semibold disabled:opacity-60"
      >
        {status === "subscribing" ? "구독 중..." : "알림 받기"}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

// VAPID base64url → Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
