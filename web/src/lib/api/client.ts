// 백엔드 API 클라이언트 — fetch 기반, JWT Bearer 자동 부착
// PRD v1.8 §6 REQ-PRODUCT-005

// 운영 도메인(api.insight.taeannews.co.kr) 미연결 상태 — 폴백은 실존하는 workers.dev로.
// env 누락 시에도 동작하도록. 운영 도메인 연결 후 교체.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

const TOKEN_KEY = "taean-insight-access-token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 사용자가 storage 차단했을 수 있음, 무시
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  // 비로그인이어도 익명 디바이스 uid로 식별(선호도 영속·개인화)
  try {
    const { getUid } = await import("../uid");
    const uid = getUid();
    if (uid) headers.set("X-Taean-Uid", uid);
  } catch { /* 무시 */ }
  // 관리자 토큰(있으면) — /admin 게이트에서 저장. 일반 요청엔 무해.
  try {
    if (typeof window !== "undefined") {
      const at = sessionStorage.getItem("taean-admin-token");
      if (at) headers.set("X-Admin-Token", at);
    }
  } catch { /* 무시 */ }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text().catch(() => null); }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, body);
  }
  // 빈 응답 처리
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
