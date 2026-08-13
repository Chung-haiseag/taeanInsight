// 주요 메뉴 정의 + 등급별 노출 필터. minRole=null 은 비로그인 포함 전체 노출.
import { hasRole, type Role } from "./roles";

export interface NavItem {
  href: string;
  label: string;
  minRole: Role | null;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/live", label: "지금 태안", minRole: null },
  { href: "/beaches", label: "해변", minRole: null },
  { href: "/data", label: "지역경제", minRole: null },
  { href: "/news", label: "뉴스아카이브", minRole: null },
  { href: "/membership", label: "멤버십", minRole: null },
  { href: "/query", label: "질의응답", minRole: "user" },
  { href: "/reports", label: "주간 리포트", minRole: "user" },
  { href: "/people", label: "인물 탐색", minRole: "user" },
  { href: "/citizen", label: "시민기자", minRole: "citizen" }, // 시민기자 등급부터. 일반회원은 /me에서 신청
  { href: "/me", label: "내 페이지", minRole: "user" },
  { href: "/reporter", label: "취재 알림", minRole: "reporter" },
];

// 현재 role로 볼 수 있는 항목만. minRole=null 은 항상 노출.
export function visibleNav(role: string | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((i) => i.minRole === null || hasRole(role, i.minRole));
}
