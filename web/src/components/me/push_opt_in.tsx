"use client";

// W3C Web Push 옵트인 (Firebase 미사용)
// PRD v1.8 §6 REQ-PRODUCT-005

import { useEffect, useState } from "react";

import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api/client";

type Status = "unknown" | "unsupported" | "default" | "granted" | "denied" | "subscribing" | "subscribed" | "error";

interface Props {
  vapidPublicKey?: string;
  onSubscribed?: (sub: PushSubscriptionJSON) => void;
}

export function PushOptInButton({ vapidPublicKey, onSubscribed }: Props) {
  const [status, setStatus] = useState<Status>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    setStatus(Notification.permission as Status);
    // 이미 허용·구독돼 있으면 본인 uid로 재등록(과거 anon 저장분 자가 치유) + 구독 상태 복원
    if (Notification.permission === "granted") {
      (async () => {
        try {
          const reg = await navigator.serviceWorker.register("/sw.js");
          await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            const json = sub.toJSON();
            await apiFetch("/api/push/subscribe", {
              method: "POST",
              body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
            }).catch(() => {});
            setStatus("subscribed");
          }
        } catch { /* 무시 */ }
      })();
    }
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

      // 백엔드에 구독 저장(공개 옵트인) — 주간 리포트 등 발송 대상
      const json = sub.toJSON();
      try {
        await apiFetch("/api/push/subscribe", {
          method: "POST",
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
      } catch {
        // 저장 실패해도 브라우저 구독은 유지 — 다음 옵트인 때 재시도
      }

      onSubscribed?.(json);
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
        <Icon name="bell-off" /> 알림이 차단되어 있습니다. 다시 받으려면 브라우저 사이트 설정에서 알림을 허용해주세요.
      </div>
    );
  }

  if (status === "subscribed") {
    return (
      <div className="border border-accent/40 rounded p-3 bg-accent-subtle/40 text-sm text-brand flex items-center justify-between gap-3">
        <span>✅ 알림이 활성화되었습니다. 매주 금요일 맞춤 브리핑·특보를 보내드려요.</span>
        <button
          type="button"
          onClick={async () => {
            setTestMsg("보내는 중…");
            try {
              const r = await apiFetch<{ sent: number }>("/api/me/push-test", { method: "POST" });
              setTestMsg(r.sent ? "전송됨 — 알림을 확인하세요" : "전송 대상 없음");
            } catch { setTestMsg("전송 실패"); }
          }}
          className="shrink-0 rounded border border-accent/40 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent-subtle/60"
        >
          {testMsg ?? "테스트 알림"}
        </button>
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

// VAPID base64url → Uint8Array (명시적 ArrayBuffer 백킹으로 BufferSource 호환)
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
