// 실제 Web Push 발송 디스패처 — RFC 8291 암호화 + RFC 8292 VAPID로 푸시 서비스에 POST.
// web_push.ts의 WebPushDispatcher 인터페이스 구현(StubWebPushDispatcher 대체).

import type { WebPushDispatcher, WebPushPayload, WebPushSubscriptionRecord } from "./web_push";
import { b64urlToBytes, encryptPayload, generateSenderKey } from "./encrypt";
import { buildVapidAuthHeader, type VapidConfig } from "./vapid";

export class WebCryptoWebPushDispatcher implements WebPushDispatcher {
  constructor(private vapid: VapidConfig, private ttlSeconds = 86400) {}

  async send(
    sub: WebPushSubscriptionRecord,
    payload: WebPushPayload,
  ): Promise<{ ok: boolean; status: number }> {
    const body = await encryptPayload({
      payload: new TextEncoder().encode(JSON.stringify(payload)),
      p256dh: b64urlToBytes(sub.p256dhKey),
      auth: b64urlToBytes(sub.authKey),
      sender: await generateSenderKey(),
      salt: crypto.getRandomValues(new Uint8Array(16)),
    });

    const auth = await buildVapidAuthHeader(sub.endpoint, this.vapid);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(this.ttlSeconds),
      },
      body,
    });
    return { ok: res.ok, status: res.status };
  }
}

// env에서 VAPID 설정을 구성(미설정이면 null → 발송 비활성)
export function vapidFromEnv(env: {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}): VapidConfig | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || "mailto:admin@taeannews.co.kr",
  };
}
