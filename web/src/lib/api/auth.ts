// 계정·로그인 클라이언트. 로그인 시 계정의 정규 uid로 교체(기기 간 동기화).
import { getUid, setUid, resetUid } from "../uid";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";
const AUTH_KEY = "taean-auth-token";

export interface Account { email: string; uid: string; displayName: string | null }

export function getAuthToken(): string | null {
  try { return localStorage.getItem(AUTH_KEY); } catch { return null; }
}
function setAuthToken(t: string | null) {
  try { if (t) localStorage.setItem(AUTH_KEY, t); else localStorage.removeItem(AUTH_KEY); } catch { /* 무시 */ }
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Taean-Uid": getUid() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function signup(email: string, password: string, displayName?: string): Promise<{ ok: boolean; error?: string; account?: Account }> {
  const { ok, data } = await post("/api/auth/signup", { email, password, displayName });
  if (!ok) return { ok: false, error: String(data.error ?? "회원가입 실패") };
  setAuthToken(String(data.token));
  setUid(String(data.uid));
  return { ok: true, account: { email: String(data.email), uid: String(data.uid), displayName: (data.displayName as string) ?? null } };
}

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string; account?: Account }> {
  const { ok, data } = await post("/api/auth/login", { email, password });
  if (!ok) return { ok: false, error: String(data.error ?? "로그인 실패") };
  setAuthToken(String(data.token));
  setUid(String(data.uid)); // 정규 uid로 교체 → 기존 개인화 동기화
  return { ok: true, account: { email: String(data.email), uid: String(data.uid), displayName: (data.displayName as string) ?? null } };
}

export async function getSession(): Promise<Account | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const u = data.user;
    if (!u) { setAuthToken(null); return null; }
    setUid(String(u.uid)); // 다른 기기 로그인 상태 반영
    return { email: u.email, uid: u.uid, displayName: u.displayName ?? null };
  } catch { return null; }
}

// 카카오 로그인 시작 — 현재 익명 uid를 넘겨 계정에 귀속
export function startKakaoLogin(): void {
  const redirect = `${window.location.origin}/login`;
  window.location.href = `${API_BASE}/api/auth/kakao/start?uid=${encodeURIComponent(getUid())}&redirect=${encodeURIComponent(redirect)}`;
}

// 콜백 URL의 kakao_token 처리 — 저장 후 true 반환(로그인 완료)
export function consumeKakaoCallback(): boolean {
  try {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("kakao_token");
    if (!t) return false;
    setAuthToken(t);
    const uid = p.get("uid");
    if (uid) setUid(uid);
    // URL 정리
    window.history.replaceState({}, "", window.location.pathname);
    return true;
  } catch { return false; }
}

export async function logout(): Promise<void> {
  const token = getAuthToken();
  try { if (token) await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }); } catch { /* 무시 */ }
  setAuthToken(null);
  resetUid(); // 새 익명 uid(공유기기 대비)
}
