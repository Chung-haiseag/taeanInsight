// 계정·로그인 클라이언트. 로그인 시 계정의 정규 uid로 교체(기기 간 동기화).
import { getUid, setUid, resetUid } from "../uid";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";
const AUTH_KEY = "taean-auth-token";

export interface Account { email: string; uid: string; displayName: string | null; role?: string; plan?: string }

// 역할 캐시 — 헤더 메뉴 필터용(로그인 시 설정, 로그아웃 시 제거)
export function cachedRole(): string | null { try { return localStorage.getItem("taean-role"); } catch { return null; } }
function setRoleCache(role?: string | null) { try { role ? localStorage.setItem("taean-role", role) : localStorage.removeItem("taean-role"); } catch { /* */ } }

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
  invalidateSession();
  return { ok: true, account: { email: String(data.email), uid: String(data.uid), displayName: (data.displayName as string) ?? null } };
}

// id = 아이디(username) 또는 이메일
export async function login(id: string, password: string): Promise<{ ok: boolean; error?: string; account?: Account }> {
  const { ok, data } = await post("/api/auth/login", { id, password });
  if (!ok) return { ok: false, error: String(data.error ?? "로그인 실패") };
  setAuthToken(String(data.token));
  setUid(String(data.uid)); // 정규 uid로 교체 → 기존 개인화 동기화
  invalidateSession();
  return { ok: true, account: { email: String(data.email), uid: String(data.uid), displayName: (data.displayName as string) ?? null } };
}

async function fetchSession(): Promise<Account | null> {
  const token = getAuthToken();
  if (!token) { setRoleCache(null); return null; } // 로그아웃 상태 — 역할 캐시도 정리(메뉴 오노출 방지)
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null; // 서버 일시오류 — 토큰 유지(잘못된 로그아웃 방지)
    const data = await res.json();
    const u = data.user;
    if (!u) { setAuthToken(null); setRoleCache(null); return null; } // 세션 무효 — 토큰·역할 정리
    setUid(String(u.uid)); // 다른 기기 로그인 상태 반영
    setRoleCache(u.role);
    return { email: u.email, uid: u.uid, displayName: u.displayName ?? null, role: u.role, plan: u.plan };
  } catch { return null; } // 네트워크 오류 — 토큰 유지
}

// 세션 조회 단일화(single-flight, 10초 캐시) — 여러 컴포넌트(헤더·계정·가드)가 동시에 불러도
//   /api/auth/me 1회 호출·결과 일관. 로그인/로그아웃 시 invalidateSession으로 갱신.
let _sessionPromise: Promise<Account | null> | null = null;
let _sessionAt = 0;
export function invalidateSession() { _sessionPromise = null; _sessionAt = 0; }
export async function getSession(): Promise<Account | null> {
  const now = Date.now();
  if (!_sessionPromise || now - _sessionAt > 10_000) { _sessionAt = now; _sessionPromise = fetchSession(); }
  return _sessionPromise;
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
    invalidateSession();
    const uid = p.get("uid");
    if (uid) setUid(uid);
    // URL 정리
    window.history.replaceState({}, "", window.location.pathname);
    return true;
  } catch { return false; }
}

async function authPost(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const token = getAuthToken();
  if (!token) return { ok: false, error: "unauthorized" };
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: res.ok ? undefined : String(data.error ?? "실패") };
}

export const updateProfile = (displayName: string) => authPost("/api/auth/profile", { displayName });
export const changePassword = (currentPassword: string, newPassword: string) => authPost("/api/auth/change-password", { currentPassword, newPassword });
export async function deleteAccount(password?: string): Promise<{ ok: boolean; error?: string }> {
  const r = await authPost("/api/auth/delete", { password });
  if (r.ok) { setAuthToken(null); resetUid(); }
  return r;
}

export async function logout(): Promise<void> {
  const token = getAuthToken();
  try { if (token) await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }); } catch { /* 무시 */ }
  setAuthToken(null);
  setRoleCache(null);
  invalidateSession();
  resetUid(); // 새 익명 uid(공유기기 대비)
}
