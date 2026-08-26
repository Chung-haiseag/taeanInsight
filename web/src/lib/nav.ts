// 주요 메뉴 정의 + 등급별 노출 필터. minRole=null 은 비로그인 포함 전체 노출.
import { hasRole, type Role } from "./roles";

export interface NavItem {
  href: string;
  label: string;
  minRole: Role | null;
}

// 순서 = 이 신문이 무엇인지 말하는 차례다.
//   37년치 기록이 이 사이트의 본체이므로 **아카이브가 앞**에 온다(실시간은 곁들이는 것).
//   인물·과거신문은 전부 아카이브에서 나온 것이라 바로 뒤에 붙는다.
export const NAV_ITEMS: NavItem[] = [
  { href: "/news", label: "뉴스아카이브", minRole: null },
  // 지면 넘겨보기(/paper)·옛 광고(/paper/ads)는 **상단에 두지 않는다.**
  //   상단 일곱 개는 고령 독자에게 많고, 지면을 통째로 넘겨보려는 수요를 잰 적이 없다.
  //   옛 광고는 뉴스아카이브 화면 위에, 지면은 기사의 '원본 지면 보기'에서 이어지게 한다.
  // 인물은 아카이브에서 파생된 **과거 사실**이라 무료다(유료로 지키는 것은 미래 판단정보다).
  //   사람 이름 검색은 지역 언론의 가장 큰 유입 통로이기도 하다.
  { href: "/people", label: "인물", minRole: null },
  { href: "/live", label: "지금 태안", minRole: null },
  { href: "/beaches", label: "해변", minRole: null },
  { href: "/data", label: "지역경제", minRole: null },
  { href: "/membership", label: "멤버십", minRole: null },
  // 코파일럿은 어느 화면에서든 오른쪽 아래 단추로 열린다. 이 메뉴는 '전체 화면'으로 쓰는 길.
  //   로그인 뒤에 숨겨 놨더니 방문자 대부분이 있는 줄도 몰랐다(2026-08-03 이후 사용 0건) → 공개로 바꾼다.
  { href: "/query", label: "AI 코파일럿", minRole: null },
  { href: "/reports", label: "주간 리포트", minRole: "user" },
  { href: "/citizen", label: "시민기자", minRole: "citizen" }, // 시민기자 등급부터. 일반회원은 /me에서 신청
  { href: "/me", label: "내 페이지", minRole: "user" },
  { href: "/reporter", label: "취재 알림", minRole: "reporter" },
];

// 현재 role로 볼 수 있는 항목만. minRole=null 은 항상 노출.
export function visibleNav(role: string | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((i) => i.minRole === null || hasRole(role, i.minRole));
}
