// RFC 8291 §5 워크드 예제로 aes128gcm 암호화 적합성 검증.
// 고정 송신자 키 + 고정 salt를 주입하면 RFC가 명시한 본문과 정확히 일치해야 함.

import { describe, expect, it } from "vitest";
import { b64urlToBytes, bytesToB64url, encryptPayload, importSenderKey } from "../src/notifications/encrypt";

// RFC 8291 §5
const PLAINTEXT = "When I grow up, I want to be a watermelon";
const UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
const AS_PUBLIC = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const AS_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
const SALT = "DGv6ra1nlYgDCS1FRnbzlw";
const EXPECTED =
  "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

describe("encryptPayload — RFC 8291 §5 적합성", () => {
  it("고정 키·salt로 RFC 본문과 정확히 일치", async () => {
    const sender = await importSenderKey(AS_PRIVATE, b64urlToBytes(AS_PUBLIC));
    const body = await encryptPayload({
      payload: new TextEncoder().encode(PLAINTEXT),
      p256dh: b64urlToBytes(UA_PUBLIC),
      auth: b64urlToBytes(AUTH),
      sender,
      salt: b64urlToBytes(SALT),
    });
    expect(bytesToB64url(body)).toBe(EXPECTED);
  });
});
