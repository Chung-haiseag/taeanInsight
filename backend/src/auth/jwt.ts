// JWT 발급·검증 — Web Crypto API 기반 (Cloudflare Workers Edge runtime 친화)
// PRD v1.8 §6 REQ-PLATFORM-002 — 액세스 토큰 1h, 리프레시 7일

export interface JwtPayload {
  sub: string;                  // 사용자 ID
  role: string;                 // 'b2c_basic' 'b2c_premium' 'b2b_basic' 'b2b_premium' 'b2g' 'citizen_reporter' 'editor' 'admin'
  email?: string;
  iat: number;                  // issued at (epoch sec)
  exp: number;                  // expires at (epoch sec)
  type: "access" | "refresh";
}

const ACCESS_TTL_SEC = 60 * 60;          // 1시간
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7일

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp" | "type">,
  type: "access" | "refresh",
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + (type === "access" ? ACCESS_TTL_SEC : REFRESH_TTL_SEC),
    type,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(full));
  const data = `${headerB64}.${payloadB64}`;

  const key = await importHmacKey(secret, "sign");
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = base64UrlEncode(sigBuf);

  return `${data}.${sigB64}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const key = await importHmacKey(secret, "verify");
  const sigBytes = base64UrlDecode(sigB64);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(data),
  );
  if (!valid) return null;

  try {
    const payloadStr = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadStr) as JwtPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
