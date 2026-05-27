// 백엔드 API 클라이언트 — fetch 기반, JWT Bearer 자동 부착
// PRD v1.8 §6 REQ-PRODUCT-005

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.insight.taeannews.co.kr";

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
