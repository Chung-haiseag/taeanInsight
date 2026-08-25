// 멤버십 API — 가입(계좌이체)·상태 조회. 결제 금액·기간은 **서버 표**에서만 온다.
import { apiFetch } from "./client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export type PlanId = "reader" | "family" | "business" | "org";

export interface Term { months: number; amount: number; label: string; note?: string }
export interface PayInfo { bank: string | null; phone: string | null }
export interface TermsResponse extends PayInfo { plan: string; terms: Term[] }

export interface PendingOrder {
  code: string; months: number; amount: number; depositor: string; created_at: string;
}
export interface MyMembership extends PayInfo {
  member: boolean;
  plan: string;
  until: string | null;
  pending: PendingOrder | null;
}
export interface OrderResult extends PayInfo {
  code: string; months: number; amount: number; depositor: string;
}

/** 요금·기간표 + 입금 안내(비로그인도 볼 수 있다 — 가격은 숨길 것이 아니다). */
export async function getTerms(): Promise<TermsResponse | null> {
  try {
    const r = await fetch(`${API_BASE}/api/membership/terms`);
    return r.ok ? ((await r.json()) as TermsResponse) : null;
  } catch { return null; }
}

/** 내 멤버십 상태. 비로그인이면 null. */
export async function getMyMembership(): Promise<MyMembership | null> {
  try { return await apiFetch<MyMembership>("/api/membership/me"); } catch { return null; }
}

/** 가입 신청 — 아직 돈이 오지 않았다. 입금 안내를 돌려받을 뿐이다. */
export async function createOrder(input: { months: number; depositor: string; contact?: string }):
Promise<{ ok: true; order: OrderResult } | { ok: false; error: string; code?: string }> {
  try {
    const order = await apiFetch<OrderResult>("/api/membership/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return { ok: true, order };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // 이미 입금 대기 중이면 그 주문을 다시 보여주면 된다(오류가 아니다).
    return { ok: false, error: /already_pending/.test(msg) ? "already_pending" : /unauthorized|401/.test(msg) ? "unauthorized" : "failed" };
  }
}

/** 입금 전 취소. */
export async function cancelOrder(code: string): Promise<boolean> {
  try {
    const r = await apiFetch<{ ok: boolean }>(`/api/membership/order/${encodeURIComponent(code)}/cancel`, { method: "POST" });
    return !!r.ok;
  } catch { return false; }
}

// ── 사전 신청(구식) ────────────────────────────────────────────────────────
//   결제가 열리기 전에 쓰던 관심 등록. 기관(org) 문의에만 남겨 둔다.
export async function submitLead(input: { email: string; plan: PlanId; name?: string; note?: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/membership/lead`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: String(data.error ?? "실패") };
  } catch {
    return { ok: false, error: "network" };
  }
}
