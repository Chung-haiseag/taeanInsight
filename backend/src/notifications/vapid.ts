// VAPID(RFC 8292) 인증 헤더 생성 — Web Push 요청의 Authorization.
// ES256 JWT를 WebCrypto로 서명. VAPID 공개키는 web 환경변수, 개인키(d)는 Worker 시크릿.

import { b64urlToBytes, bytesToB64url } from "./encrypt";

function pubToXY(pub: Uint8Array): { x: string; y: string } {
  return { x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)) };
}
const jsonB64url = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));

export interface VapidConfig {
  publicKey: string;   // base64url 비압축 65바이트
  privateKey: string;  // base64url d (32바이트)
  subject: string;     // "mailto:..." 또는 사이트 URL
}

/**
 * 엔드포인트 origin을 aud로 하는 VAPID JWT 서명 → Authorization 헤더값 반환.
 *   "vapid t=<JWT>, k=<공개키 base64url>"
 */
export async function buildVapidAuthHeader(endpoint: string, cfg: VapidConfig, now: number = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: cfg.subject };
  const signingInput = `${jsonB64url(header)}.${jsonB64url(payload)}`;

  const pubRaw = b64urlToBytes(cfg.publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: cfg.privateKey, ...pubToXY(pubRaw), ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput)),
  );
  const jwt = `${signingInput}.${bytesToB64url(sig)}`;
  return `vapid t=${jwt}, k=${cfg.publicKey}`;
}
