// 2026 시민기자 공개 모집 지원 — 비로그인 공개 접수(신문 광고/QR 유입).

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

export interface RecruitInput {
  name: string;
  phone?: string;
  email?: string;
  region?: string;
  ageGroup?: string;
  interest?: string;
  motivation?: string;
}

export async function submitCitizenRecruit(input: RecruitInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/citizen/recruit`, {
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
