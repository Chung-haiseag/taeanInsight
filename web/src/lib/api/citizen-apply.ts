import { apiFetch } from "./client";

export interface MyCitizenApp { id: number; status: "pending" | "approved" | "rejected"; reason: string | null; applied_at: string }

export const applyCitizen = (reason?: string) =>
  apiFetch<{ ok: boolean; status: string }>("/api/auth/citizen-apply", { method: "POST", body: JSON.stringify({ reason }) });

export const getMyApplication = () =>
  apiFetch<{ application: MyCitizenApp | null }>("/api/auth/citizen-apply");
