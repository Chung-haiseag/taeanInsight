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

// 로그인 시 계정의 정규 uid로 교체(기기 간 개인화 동기화). 로그아웃 시 새 익명 uid 발급.
export function setUid(uid: string): void {
  try { if (uid && /^[A-Za-z0-9_-]{8,64}$/.test(uid)) localStorage.setItem(KEY, uid); } catch { /* 무시 */ }
}
export function resetUid(): void {
  try { localStorage.removeItem(KEY); getUid(); } catch { /* 무시 */ }
}
