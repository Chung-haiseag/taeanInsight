// 공개 인물 탐색(독자용, 읽기 전용) — /api/kg. 관리자 KG API와 분리, 타입만 재사용.
import { apiFetch } from "./client";
import type { PersonSearchResult, PersonProfile } from "./kg";

export const searchPersonsPublic = (q: string) =>
  apiFetch<{ results: PersonSearchResult[] }>(`/api/kg/persons/search?q=${encodeURIComponent(q)}`);

export const getPersonProfilePublic = (id: string) =>
  apiFetch<PersonProfile>(`/api/kg/person/${encodeURIComponent(id)}/profile`);

// AI 전기(기사 근거 5~7문장, 미검증) — 프로필 표시 후 지연 로드. null이면 근거 부족.
export const getPersonBriefPublic = (id: string) =>
  apiFetch<{ brief: string | null }>(`/api/kg/person/${encodeURIComponent(id)}/brief`);

// 공개 여부(페이지·네비가 확인)
export const getKgStatus = () => apiFetch<{ enabled: boolean }>("/api/kg/status");
