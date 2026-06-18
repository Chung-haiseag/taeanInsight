// Web Push 페이로드 암호화 — RFC 8291 (aes128gcm). Cloudflare Workers WebCrypto만 사용.
// web-push 라이브러리(노드 crypto 의존) 대체. RFC 8291 §5 테스트벡터로 검증(encrypt.test.ts).

export function b64urlToBytes(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = t.length % 4 ? 4 - (t.length % 4) : 0;
  const bin = atob(t + "=".repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(b: Uint8Array): string {
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

// 비압축 EC 공개키(65바이트 0x04||x||y) → JWK x,y
function pubToXY(pub: Uint8Array): { x: string; y: string } {
  return { x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)) };
}

// HKDF: salt+ikm(base key)+info → length 바이트
async function hkdf(saltB: Uint8Array, ikmKey: CryptoKey, info: Uint8Array, length: number): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: saltB, info },
    ikmKey,
    length * 8,
  );
  return new Uint8Array(bits);
}

export interface SenderKey {
  privateKey: CryptoKey;  // ECDH P-256 deriveBits
  publicRaw: Uint8Array;  // 65바이트 비압축
}

// 송신자(앱서버) 임시 키페어 생성
export async function generateSenderKey(): Promise<SenderKey> {
  // workers-types의 generateKey 오버로드 회피(런타임 정상) — ECDH 키페어 생성
  const kp = (await (crypto.subtle as { generateKey: (...a: unknown[]) => Promise<CryptoKeyPair> }).generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  )) as CryptoKeyPair;
  const publicRaw = new Uint8Array(
    (await (crypto.subtle.exportKey as (f: string, k: CryptoKey) => Promise<ArrayBuffer>)("raw", kp.publicKey)),
  );
  return { privateKey: kp.privateKey, publicRaw };
}

// 테스트/고정용 — 송신자 개인키(d)+공개키(raw)로 SenderKey 구성
export async function importSenderKey(dB64url: string, publicRaw: Uint8Array): Promise<SenderKey> {
  const { x, y } = pubToXY(publicRaw);
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: dB64url, x, y, ext: true },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  return { privateKey, publicRaw };
}

/**
 * RFC 8291 aes128gcm 단일 레코드 암호화. 반환은 전송 본문 전체:
 *   salt(16) || rs(4 BE=4096) || idlen(1=65) || as_public(65) || ciphertext+tag
 */
export async function encryptPayload(opts: {
  payload: Uint8Array;       // 평문
  p256dh: Uint8Array;        // 수신자(UA) 공개키 65바이트
  auth: Uint8Array;          // 수신자 auth secret 16바이트
  sender: SenderKey;         // 송신자 키(임시 또는 고정)
  salt: Uint8Array;          // 16바이트
}): Promise<Uint8Array> {
  const { payload, p256dh, auth, sender, salt } = opts;

  // 1) ECDH 공유 비밀 (as_private × ua_public)
  const uaPubKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", ...pubToXY(p256dh), ext: true },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaPubKey } as unknown as { name: string; public: CryptoKey },
      sender.privateKey,
      256,
    ),
  );

  // 2) IKM = HKDF(salt=auth, ikm=shared, info="WebPush: info"||0x00||ua_pub||as_pub)
  const sharedKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  const keyInfo = concat(utf8("WebPush: info"), new Uint8Array([0]), p256dh, sender.publicRaw);
  const ikm = await hkdf(auth, sharedKey, keyInfo, 32);

  // 3) CEK/NONCE = HKDF(salt=message salt, ikm=IKM, info=...)
  const ikmKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const cek = await hkdf(salt, ikmKey, concat(utf8("Content-Encoding: aes128gcm"), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikmKey, concat(utf8("Content-Encoding: nonce"), new Uint8Array([0])), 12);

  // 4) AES-128-GCM 암호화 (평문 || 0x02 패딩 구분자)
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const padded = concat(payload, new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));

  // 5) aes128gcm 헤더 + 암호문
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  const header = concat(salt, rs, new Uint8Array([sender.publicRaw.length]), sender.publicRaw);
  return concat(header, ct);
}
