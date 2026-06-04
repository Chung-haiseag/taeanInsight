// 초개인화 홈 — 구독자(또는 미리보기)에게 보이는 관심사 기반 첫 화면.
// 데모에서는 mock preferences/favorites로 구성. 실서비스 시 /api/me 데이터로 대체.

import Link from "next/link";
import { AILabelBadge } from "@/components/ai-label-badge";
import {
  CATEGORY_LABELS,
  REGION_OPTIONS,
  type InterestCategory,
  type UserFavorite,
  type UserPreferences,
} from "@/lib/types";

function regionLabel(code: string): string {
  return REGION_OPTIONS.find((r) => r.code === code)?.label ?? code;
}

// 관심 지역 × 관심사 기반 mock 예측 (데모 시각화용)
const SAMPLE_PREDICTION: Record<string, { metric: string; value: string; trend: string }> = {
  tourism: { metric: "다음 주 방문 예측", value: "▲ 1.8만 명", trend: "전주 대비 +12%" },
  environment: { metric: "적조·미세먼지", value: "관심", trend: "PM2.5 주말 상승 예상" },
  realestate: { metric: "토지·임대 시세", value: "보합", trend: "전월 대비 +0.4%" },
  policy: { metric: "군정 주요 의결", value: "3건", trend: "이번 주 군의회" },
  industry: { metric: "수산·양식 동향", value: "주의", trend: "수온 상승 모니터링" },
  culture: { metric: "지역 행사", value: "2건", trend: "주말 축제 예정" },
};

export function PersonalizedHome({
  prefs,
  favorites,
  blurred = false,
}: {
  prefs: UserPreferences;
  favorites: UserFavorite[];
  blurred?: boolean;
}) {
  const regions = prefs.regions.length ? prefs.regions : ["taean_eup"];
  const categories: InterestCategory[] = prefs.categories.length ? prefs.categories : ["tourism"];

  return (
    <div className={blurred ? "select-none pointer-events-none" : ""} aria-hidden={blurred}>
      <div className="space-y-8">
        {/* 인사 */}
        <section className="space-y-1 pt-2">
          <p className="text-accent font-semibold">초개인화 홈</p>
          <h1 className="text-2xl md:text-3xl font-bold text-brand">
            {regions.map(regionLabel).join(" · ")}의 오늘, 한눈에.
          </h1>
          <p className="text-foreground-muted">
            관심사 {categories.map((c) => CATEGORY_LABELS[c]).join("·")} 기준으로 화면을 재구성했어요.
          </p>
        </section>

        {/* 관심 지역 오늘의 예측 */}
        <section aria-labelledby="pred-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 id="pred-heading" className="text-xl font-bold text-brand">
              내 관심사 오늘의 예측
            </h2>
            <AILabelBadge kind="ai_assisted" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => {
              const p = SAMPLE_PREDICTION[cat] ?? SAMPLE_PREDICTION.tourism;
              return (
                <article key={cat} className="border border-brand/15 rounded-lg p-4 bg-background">
                  <p className="text-xs text-foreground-muted">{CATEGORY_LABELS[cat]} · {p.metric}</p>
                  <p className="text-2xl font-bold text-brand mt-1">{p.value}</p>
                  <p className="text-xs text-accent mt-1">{p.trend}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* 맞춤 리포트 요약 */}
        <section aria-labelledby="report-heading" className="space-y-3">
          <h2 id="report-heading" className="text-xl font-bold text-brand">
            나를 위한 이번 주 리포트
          </h2>
          <div className="border border-accent/40 rounded-lg p-4 bg-accent-subtle/30 space-y-2">
            <p className="text-sm text-brand font-semibold">
              {regionLabel(regions[0])} {CATEGORY_LABELS[categories[0]]} 주간 브리핑
            </p>
            <p className="text-sm text-foreground-muted">
              관심 지역·관심사에 맞춰 AI가 추린 핵심 3가지를 매주 금요일 이 자리에 배치합니다.
              초개인화 우선순위(critical → community → personal)로 정렬돼요.
            </p>
            <Link href="/reports" className="inline-block text-sm font-semibold text-accent hover:underline">
              전체 리포트 보기 →
            </Link>
          </div>
        </section>

        {/* 즐겨찾기 바로가기 */}
        <section aria-labelledby="fav-heading" className="space-y-3">
          <h2 id="fav-heading" className="text-xl font-bold text-brand">
            즐겨찾기 바로가기
          </h2>
          {favorites.length ? (
            <div className="flex flex-wrap gap-2">
              {favorites.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1 border border-brand/20 rounded-full px-3 py-1 text-sm text-brand bg-background"
                >
                  ★ {f.label ?? f.refId}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground-muted">아직 즐겨찾기가 없어요.</p>
          )}
        </section>
      </div>
    </div>
  );
}
