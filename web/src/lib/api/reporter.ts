// 기자 취재 알림 API 클라이언트
import { apiFetch } from "./client";

export interface ReporterKeyword { id: number; keyword: string }
export interface ReporterMe { registered: boolean; keywords: ReporterKeyword[] }
export interface ReporterAlert { kind: string; title: string; body: string; url: string; created_at: string }

export const getReporterMe = () => apiFetch<ReporterMe>("/api/reporter/me");
export const registerReporter = (name?: string) =>
  apiFetch<{ ok: boolean }>("/api/reporter/register", { method: "POST", body: JSON.stringify({ name }) });
export const unregisterReporter = () => apiFetch<{ ok: boolean }>("/api/reporter/register", { method: "DELETE" });
export const addReporterKeyword = (keyword: string) =>
  apiFetch<{ ok: boolean; error?: string }>("/api/reporter/keywords", { method: "POST", body: JSON.stringify({ keyword }) });
export const deleteReporterKeyword = (id: number) =>
  apiFetch<{ ok: boolean }>(`/api/reporter/keywords/${id}`, { method: "DELETE" });
export const getReporterAlerts = () => apiFetch<{ alerts: ReporterAlert[] }>("/api/reporter/alerts");

export interface ArticleDraft { title: string; body: string; sources: { title: string; url: string }[] }
export const draftFromAlert = (a: { title?: string; body?: string; kind?: string }) =>
  apiFetch<ArticleDraft>("/api/reporter/draft", { method: "POST", body: JSON.stringify(a) });
