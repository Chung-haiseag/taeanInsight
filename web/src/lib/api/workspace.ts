// 팀·부서 공유 워크스페이스 API 클라이언트.
import { apiFetch } from "./client";

export interface WSMember { userId: string; role: "admin" | "member"; displayName: string | null; joinedAt: string }
export interface WSNote { id: string; userId: string; authorName: string | null; body: string; createdAt: string }
export interface WSItem { id: string; userId: string; label: string; url: string | null; kind: string | null; createdAt: string }
export interface WSView {
  workspace: { id: string; name: string; kind: "team" | "dept"; joinCode: string; role: "admin" | "member" } | null;
  members: WSMember[];
  items: WSItem[];
  notes: WSNote[];
}

export const getWorkspace = () => apiFetch<WSView>("/api/me/workspace");
export const createWorkspace = (name: string, kind: "team" | "dept", displayName?: string) =>
  apiFetch<{ ok: boolean; joinCode: string; id: string }>("/api/me/workspace/create", { method: "POST", body: JSON.stringify({ name, kind, displayName }) });
export const joinWorkspace = (code: string, displayName?: string) =>
  apiFetch<{ ok: boolean; error?: string }>("/api/me/workspace/join", { method: "POST", body: JSON.stringify({ code, displayName }) });
export const leaveWorkspace = () => apiFetch("/api/me/workspace/leave", { method: "POST", body: "{}" });
export const addNote = (body: string) => apiFetch("/api/me/workspace/notes", { method: "POST", body: JSON.stringify({ body }) });
export const deleteNote = (id: string) => apiFetch(`/api/me/workspace/notes/${id}`, { method: "DELETE" });
export const addItem = (label: string, url?: string, kind?: string) => apiFetch("/api/me/workspace/items", { method: "POST", body: JSON.stringify({ label, url, kind }) });
export const deleteItem = (id: string) => apiFetch(`/api/me/workspace/items/${id}`, { method: "DELETE" });
