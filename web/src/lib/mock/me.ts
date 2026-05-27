// 백엔드 미연결 상태에서 /me 페이지 시각 검증용 mock
// 환경변수 NEXT_PUBLIC_USE_MOCK=true 일 때 사용

import type { MeResponse, UserPreferences, UserFavorite } from "../types";

export function getMockMeResponse(): MeResponse {
  return {
    onboarded: true,
    preferences: mockPreferences(),
    favorites: mockFavorites(),
    b2gMemberships: [],
  };
}

export function mockPreferences(): UserPreferences {
  return {
    userId: "mock-user-1",
    segment: "b2c_premium",
    regions: ["anmyeon", "taean_eup"],
    categories: ["tourism", "environment"],
    notificationChannels: ["webpush", "email"],
    onboardedAt: "2026-05-27T00:00:00Z",
    updatedAt: "2026-05-27T00:00:00Z",
  };
}

export function mockFavorites(): UserFavorite[] {
  return [
    {
      id: "fav-1",
      userId: "mock-user-1",
      kind: "place",
      refId: "kkotji-beach",
      label: "꽃지 해수욕장",
      createdAt: "2026-05-20T00:00:00Z",
    },
    {
      id: "fav-2",
      userId: "mock-user-1",
      kind: "place",
      refId: "malliro-beach",
      label: "만리포 해수욕장",
      createdAt: "2026-05-22T00:00:00Z",
    },
    {
      id: "fav-3",
      userId: "mock-user-1",
      kind: "event",
      refId: "anmyeon-daeha-2026",
      label: "안면도 대하축제 2026",
      createdAt: "2026-05-25T00:00:00Z",
    },
  ];
}

export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK === "true";
}
