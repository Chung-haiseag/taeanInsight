// 멤버십 사전 신청 클라이언트
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export type PlanId = "reader" | "business" | "org";

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
