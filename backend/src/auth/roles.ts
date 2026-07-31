// 회원 등급(role) 순수 로직 — 순위·게이트·임명권한. 의존성 없음(TDD 대상).
//   순위: user < citizen < reporter < admin < superadmin.

export const ROLE_VALUES = ["user", "citizen", "reporter", "admin", "superadmin"] as const;
export type Role = (typeof ROLE_VALUES)[number];

export const ROLE_RANK: Record<Role, number> = {
  user: 0,
  citizen: 1,
  reporter: 2,
  admin: 3,
  superadmin: 4,
};

// userRole이 minRole 이상이면 true. 미지의 role(레거시·빈값)은 false.
export function hasRole(userRole: string, minRole: Role): boolean {
  const r = ROLE_RANK[userRole as Role];
  return r !== undefined && r >= ROLE_RANK[minRole];
}

// 요청자가 대상 등급을 부여할 수 있는가.
//   superadmin: 전부. admin: user·citizen만(시민기자 승인/해제). 그 외: 불가.
export function canAssignRole(requesterRole: string, targetRole: Role): boolean {
  if (requesterRole === "superadmin") return true;
  if (requesterRole === "admin") return targetRole === "user" || targetRole === "citizen";
  return false;
}

// 요청자가 대상(현재 등급)을 변경할 수 있는가 — 대상이 요청자보다 상위면 불가(강등 보호).
export function canModifyUser(requesterRole: string, targetRole: string): boolean {
  const req = ROLE_RANK[requesterRole as Role];
  const tgt = ROLE_RANK[targetRole as Role];
  if (req === undefined) return false;
  return tgt === undefined || req >= tgt;
}
