// /me API 클라이언트 — 백엔드 backend/src/preferences/router.ts와 매핑

import { apiFetch } from "./client";
import type {
  FavoriteKind,
  InterestCategory,
  MeResponse,
  NotificationChannel,
  UserFavorite,
  UserPreferences,
  UserSegment,
} from "../types";

export async function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/me");
}

export interface OnboardInput {
  segment: UserSegment;
  regions: string[];
  categories: InterestCategory[];
  notificationChannels: NotificationChannel[];
}

export async function submitOnboarding(input: OnboardInput): Promise<UserPreferences> {
  return apiFetch<UserPreferences>("/api/me/onboarding", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updatePreferences(
  patch: Partial<{ regions: string[]; categories: InterestCategory[]; notificationChannels: NotificationChannel[] }>,
): Promise<UserPreferences> {
  return apiFetch<UserPreferences>("/api/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function listFavorites(): Promise<{ favorites: UserFavorite[] }> {
  return apiFetch<{ favorites: UserFavorite[] }>("/api/me/favorites");
}

export async function addFavorite(input: {
  kind: FavoriteKind;
  refId: string;
  label?: string;
  metadata?: Record<string, unknown>;
}): Promise<UserFavorite> {
  return apiFetch<UserFavorite>("/api/me/favorites", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeFavorite(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/me/favorites/${id}`, { method: "DELETE" });
}
