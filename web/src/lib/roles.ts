// 회원 등급 순수 로직 — 백엔드 backend/src/auth/roles.ts의 프런트 미러(가시성/가드용).
//   순위: user < citizen < reporter < admin < superadmin. 미지·비로그인은 하위 취급.

export const ROLE_VALUES = ["user", "citizen", "reporter", "admin", "superadmin"] as const;
export type Role = (typeof ROLE_VALUES)[number];

export const ROLE_RANK: Record<Role, number> = {
  user: 0,
  citizen: 1,
  reporter: 2,
  admin: 3,
  superadmin: 4,
};

// userRole이 minRole 이상이면 true. null·미지 role은 false.
export function hasRole(userRole: string | null | undefined, minRole: Role): boolean {
  if (!userRole) return false;
  const r = ROLE_RANK[userRole as Role];
  return r !== undefined && r >= ROLE_RANK[minRole];
}
