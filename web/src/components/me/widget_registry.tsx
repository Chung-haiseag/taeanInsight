// 위젯 가시성 제어 — PRD v1.8 §6 REQ-PRODUCT-005 (3) 결정
// 같은 /me 페이지에서 세그먼트에 따라 위젯이 자동 표시/숨김

import type { ReactNode } from "react";
import type { UserPreferences, UserSegment, B2gMembership, UserFavorite } from "@/lib/types";
import {
  ArchivePicks,
  B2gDepartmentSpace,
  FavoritesList,
  GovNotices,
  KpiCards,
  MyNews,
  PersonalizedReport,
  TeamWorkspace,
  TodayConditions,
  UsagePanel,
  WelcomeBanner,
} from "./widgets";

export type WidgetKey =
  | "today_conditions"
  | "welcome_banner"
  | "kpi_cards"
  | "my_news"
  | "favorites_list"
  | "personalized_report"
  | "archive_picks"
  | "gov_notices"
  | "team_workspace"
  | "b2g_department_space"
  | "usage_panel";

// 세그먼트별 노출 + 정렬 (상단부터)
const WIDGET_ORDER: Record<UserSegment, WidgetKey[]> = {
  b2c_basic: [
    "today_conditions",
    "welcome_banner",
    "my_news",
    "favorites_list",
    "gov_notices",
    "archive_picks",
    "usage_panel",
  ],
  b2c_premium: [
    "today_conditions",
    "welcome_banner",
    "personalized_report",
    "my_news",
    "favorites_list",
    "gov_notices",
    "archive_picks",
    "usage_panel",
    "kpi_cards",
  ],
  b2b_basic: [
    "today_conditions",
    "kpi_cards",
    "personalized_report",
    "my_news",
    "archive_picks",
    "favorites_list",
    "gov_notices",
    "team_workspace",
    "usage_panel",
  ],
  b2b_premium: [
    "today_conditions",
    "kpi_cards",
    "personalized_report",
    "my_news",
    "archive_picks",
    "favorites_list",
    "gov_notices",
    "team_workspace",
    "usage_panel",
  ],
  b2g: [
    "today_conditions",
    "kpi_cards",
    "b2g_department_space",
    "gov_notices",
    "personalized_report",
    "my_news",
    "archive_picks",
    "favorites_list",
    "usage_panel",
  ],
};

export interface WidgetRegistryProps {
  preferences: UserPreferences;
  favorites: UserFavorite[];
  b2gMemberships?: B2gMembership[];
  tone?: "warm" | "tool"; // B2C Premium 토글 결과 (기본은 segment 기반)
}

export function renderWidgets({
  preferences,
  favorites,
  b2gMemberships,
  tone,
}: WidgetRegistryProps): Array<{ key: WidgetKey; node: ReactNode }> {
  const order = WIDGET_ORDER[preferences.segment];

  // B2C Premium에서 tone="tool"이면 B2B 톤처럼 지표·리포트를 위로
  let final: WidgetKey[] = [...order];
  if (preferences.segment === "b2c_premium" && tone === "tool") {
    final = [
      "today_conditions",
      "kpi_cards",
      "personalized_report",
      "my_news",
      "archive_picks",
      "favorites_list",
      "usage_panel",
    ];
  }

  return final.map((key) => {
    const node = renderOne(key, preferences, favorites, b2gMemberships);
    return { key, node };
  });
}

function renderOne(
  key: WidgetKey,
  preferences: UserPreferences,
  favorites: UserFavorite[],
  b2gMemberships?: B2gMembership[],
): ReactNode {
  switch (key) {
    case "today_conditions":
      return <TodayConditions preferences={preferences} />;
    case "welcome_banner":
      return <WelcomeBanner preferences={preferences} />;
    case "kpi_cards":
      // B2C는 하단 노출, B2B/B2G는 상단
      return (
        <KpiCards
          position={preferences.segment.startsWith("b2c") ? "bottom" : "top"}
          preferences={preferences}
        />
      );
    case "my_news":
      return <MyNews preferences={preferences} />;
    case "favorites_list":
      return <FavoritesList segment={preferences.segment} favorites={favorites} />;
    case "personalized_report":
      return <PersonalizedReport preferences={preferences} />;
    case "archive_picks":
      return <ArchivePicks preferences={preferences} />;
    case "gov_notices":
      return <GovNotices />;
    case "team_workspace":
      return <TeamWorkspace />;
    case "b2g_department_space":
      return <B2gDepartmentSpace />;
    case "usage_panel":
      return <UsagePanel preferences={preferences} />;
    default:
      return null;
  }
}
