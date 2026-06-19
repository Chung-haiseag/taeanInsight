// 익명 디바이스 uid — 로그인 없이도 선호도·개인화를 유지(나중에 계정으로 승격).
// localStorage에 보관, 백엔드 X-Taean-Uid 헤더로 전달.

const KEY = "taean-uid";

export function getUid(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(KEY);
    if (!id || id.length < 8) {
      const rnd = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9]/g, "");
      id = `u_${rnd.slice(0, 22)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
