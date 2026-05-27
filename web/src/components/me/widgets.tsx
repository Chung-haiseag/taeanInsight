// 7개 위젯 컴포넌트 — PRD v1.8 §6 REQ-PRODUCT-005
// 세그먼트별 가시성·정렬은 widget_registry.tsx에서 결정

import { AILabelBadge } from "../ai-label-badge";
import type { UserFavorite, UserPreferences } from "@/lib/types";
import { CATEGORY_LABELS, REGION_OPTIONS } from "@/lib/types";

function regionLabel(code: string): string {
  return REGION_OPTIONS.find((r) => r.code === code)?.label ?? code;
}

// ---------- welcome_banner (B2C 환영 톤) ----------

export function WelcomeBanner({ preferences }: { preferences: UserPreferences }) {
  const regionList = preferences.regions.map(regionLabel).join(" · ");
  return (
    <section
      aria-labelledby="welcome-heading"
      className="rounded-lg bg-accent-subtle/40 border border-accent/30 p-6"
    >
      <h2 id="welcome-heading" className="text-xl font-bold text-brand">
        오늘도 어서 오세요 ☀️
      </h2>
      <p className="text-foreground-muted mt-1">
        관심 지역 <strong className="text-brand">{regionList || "—"}</strong>에 대한
        이번 주 핵심을 정리해 두었습니다.
      </p>
    </section>
  );
}

// ---------- kpi_cards (B2B·B2G 도구 톤) ----------

const KPI_PLACEHOLDERS = [
  { label: "다음 주 관광객 예측", value: "—", unit: "주간" },
  { label: "미세먼지 예보 평균", value: "—", unit: "주간" },
  { label: "토지 시세 추이", value: "—", unit: "월간" },
  { label: "내 분야 키워드 트렌드", value: "—", unit: "주간" },
];

export function KpiCards({ position }: { position: "top" | "bottom" }) {
  return (
    <section
      aria-labelledby="kpi-heading"
      className={position === "top" ? "" : "pt-2"}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 id="kpi-heading" className="text-lg font-bold text-brand">
          핵심 지표
        </h2>
        <AILabelBadge kind="ai_assisted" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {KPI_PLACEHOLDERS.map((m) => (
          <article
            key={m.label}
            className="border border-brand/15 rounded-lg p-4 bg-background"
          >
            <p className="text-xs text-foreground-muted">{m.unit}</p>
            <p className="text-3xl font-bold text-brand mt-1">{m.value}</p>
            <p className="text-sm font-semibold text-brand mt-2">{m.label}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------- favorites_list ----------

const FAVORITE_LABELS_BY_SEGMENT: Record<string, string> = {
  b2c_basic: "내 즐겨찾기 명소",
  b2c_premium: "내 즐겨찾기 명소",
  b2b_basic: "내 상권·고객 즐겨찾기",
  b2b_premium: "내 상권·고객 즐겨찾기",
  b2g: "내 정책 자료 즐겨찾기",
};

export function FavoritesList({
  segment,
  favorites,
}: {
  segment: UserPreferences["segment"];
  favorites: UserFavorite[];
}) {
  const heading = FAVORITE_LABELS_BY_SEGMENT[segment] ?? "내 즐겨찾기";
  return (
    <section aria-labelledby="favs-heading">
      <h2 id="favs-heading" className="text-lg font-bold text-brand mb-3">
        {heading}
      </h2>
      {favorites.length === 0 ? (
        <p className="text-sm text-foreground-muted border border-dashed border-brand/20 rounded p-4">
          아직 즐겨찾기가 없습니다. 관심 있는 명소·이벤트를 저장해 두면 여기에 모입니다.
        </p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {favorites.map((f) => (
            <li
              key={f.id}
              className="border border-brand/15 rounded p-3 bg-background flex items-center justify-between"
            >
              <div>
                <p className="font-semibold text-brand">{f.label ?? f.refId}</p>
                <p className="text-xs text-foreground-muted capitalize">{f.kind}</p>
              </div>
              <span className="text-xs text-foreground-muted">{new Date(f.createdAt).toLocaleDateString("ko-KR")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- personalized_report (Premium+ 노출) ----------

export function PersonalizedReport({ preferences }: { preferences: UserPreferences }) {
  const cats = preferences.categories.map((c) => CATEGORY_LABELS[c]).join(" · ");
  return (
    <section
      aria-labelledby="report-heading"
      className="border-l-4 border-accent bg-brand/5 rounded-lg p-5"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 id="report-heading" className="text-lg font-bold text-brand">
          내 맞춤 주간 리포트
        </h2>
        <AILabelBadge kind="ai_assisted" />
      </div>
      <p className="text-foreground-muted text-sm">
        관심 분야 <strong className="text-brand">{cats || "—"}</strong> 기준으로 재구성된 주간 리포트가
        매주 금요일 09:00에 발행됩니다.
      </p>
      <p className="text-xs text-foreground-muted mt-2">
        🚧 발행 파이프라인 연결 대기 (백엔드 #22 완료, API 라우트 연결 예정)
      </p>
    </section>
  );
}

// ---------- team_workspace (B2B) ----------

export function TeamWorkspace() {
  return (
    <section
      aria-labelledby="team-heading"
      className="border border-brand/20 rounded-lg p-5 bg-background"
    >
      <h2 id="team-heading" className="text-lg font-bold text-brand mb-2">
        팀 작업 공간
      </h2>
      <p className="text-sm text-foreground-muted">
        팀원과 대시보드·즐겨찾기를 공유하고, 분석 요청을 함께 추적합니다.
      </p>
      <p className="text-xs text-foreground-muted mt-2">🚧 구현 예정 — 다음 마일스톤</p>
    </section>
  );
}

// ---------- b2g_department_space (B2G만) ----------

export function B2gDepartmentSpace({ orgName }: { orgName?: string }) {
  return (
    <section
      aria-labelledby="b2g-heading"
      className="border-2 border-accent rounded-lg p-5 bg-accent-subtle/20"
    >
      <h2 id="b2g-heading" className="text-lg font-bold text-brand mb-2">
        부서 공유 공간 {orgName ? `· ${orgName}` : ""}
      </h2>
      <ul className="text-sm text-foreground-muted space-y-1">
        <li>· 부서 단위 데이터 공유 폴더</li>
        <li>· 보고서 자동 생성 (월간·분기)</li>
        <li>· 내부 메모·코멘트</li>
      </ul>
      <p className="text-xs text-foreground-muted mt-3">🚧 구현 예정 — 다음 마일스톤</p>
    </section>
  );
}

// ---------- usage_panel ----------

export function UsagePanel({ preferences }: { preferences: UserPreferences }) {
  return (
    <section
      aria-labelledby="usage-heading"
      className="border border-brand/10 rounded-lg p-4 bg-background"
    >
      <h2 id="usage-heading" className="text-sm font-semibold text-brand mb-2">
        구독 · 사용량
      </h2>
      <dl className="grid gap-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-foreground-muted">플랜</dt>
          <dd className="text-brand">{preferences.segment}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground-muted">관심 지역</dt>
          <dd>{preferences.regions.length}개</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground-muted">관심 분야</dt>
          <dd>{preferences.categories.length}개</dd>
        </div>
      </dl>
    </section>
  );
}
