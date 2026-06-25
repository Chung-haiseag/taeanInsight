"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { renderWidgets } from "@/components/me/widget_registry";
import { ToneToggleBar, useToneToggle } from "@/components/me/tone_toggle";
import { PushOptInButton } from "@/components/me/push_opt_in";
import { MeHeroStrip } from "@/components/me/hero-strip";
import { MeOwnerBoard } from "@/components/me/owner-board";
import { ReaderPicks } from "@/components/me/reader-picks";

// 가로 전체로 둘 위젯(긴 목록·핵심) — 나머지는 2열 절반
const FULL_WIDTH = new Set(["my_news", "personalized_report", "team_workspace", "b2g_department_space", "gov_notices"]);
import { canToggleTone, preferredTone, REGION_OPTIONS, SEGMENT_LIMITS, type MeResponse } from "@/lib/types";
import { getMe } from "@/lib/api/me";

export default function MePage() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // /me는 항상 실제 저장 데이터(익명 uid)로 — 온보딩·가게설정이 즉시 반영되도록.
        // (목 모드는 홈 데모 쇼케이스 전용; 개인화 화면엔 적용하지 않음)
        const resp = await getMe();
        setData(resp);
      } catch (e) {
        setError(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <ErrorState message="응답이 비어있습니다" />;

  if (!data.onboarded || !data.preferences) {
    return <OnboardingPrompt />;
  }

  return <MeDashboard data={data} />;
}

function MeDashboard({ data }: { data: MeResponse }) {
  const preferences = data.preferences!;
  const defaultTone = preferredTone(preferences.segment);
  const { tone, setTone } = useToneToggle(defaultTone);
  const showToneToggle = canToggleTone(preferences.segment);

  const widgets = useMemo(
    () =>
      renderWidgets({
        preferences,
        favorites: data.favorites ?? [],
        b2gMemberships: data.b2gMemberships,
        tone,
      }),
    [data.b2gMemberships, data.favorites, preferences, tone],
  );

  const regionLabels = preferences.regions
    .map((c) => REGION_OPTIONS.find((r) => r.code === c)?.label ?? c)
    .filter(Boolean);
  const segLabel = SEGMENT_LIMITS[preferences.segment]?.label ?? preferences.segment;

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      {/* 에디토리얼 헤더 */}
      <header className="pt-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow"><span className="inline-block w-6 h-px bg-accent" aria-hidden /> My Page · 초개인화</p>
            <h1 className="mt-4 font-display text-display-sm text-brand">내 관심사로 본 태안</h1>
          </div>
          {showToneToggle && <ToneToggleBar tone={tone} onChange={setTone} />}
        </div>
        <span className="accent-rule mt-5" aria-hidden />
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-brand/5 border border-brand/10 px-3 py-1 text-xs font-medium text-foreground-muted">{segLabel}</span>
          {regionLabels.map((r) => (
            <span key={r} className="rounded-full bg-accent-subtle/40 border border-accent/20 px-3 py-1 text-xs font-medium text-brand">{r}</span>
          ))}
          <Link href="/me/onboarding" className="ml-1 text-xs font-semibold text-accent hover:underline">관심사 수정</Link>
        </div>
        <p className="mt-3 text-sm text-foreground-muted">발행 콘텐츠는 모두 편집부 검토(HITL)를 거칩니다.</p>
      </header>

      {/* 오늘 한눈에 — 히어로 요약 */}
      <MeHeroStrip preferences={preferences} />

      {/* 독자 행동 기반 실시간 픽(데이터 있을 때만 표시) */}
      <ReaderPicks />

      {/* 사장님 보드 — 가게 정보가 있으면 운영 보드, 없으면 입력 안내 */}
      <MeOwnerBoard />

      {/* Push 옵트인 — 알림 채널에 webpush 있으면 노출 */}
      {preferences.notificationChannels.includes("webpush") && (
        <PushOptInButton vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
      )}

      {/* 위젯 — 매거진식 2열 그리드(핵심은 가로 전체) */}
      <div className="grid gap-5 md:grid-cols-2">
        {widgets
          .filter(({ key }) => key !== "welcome_banner") // 인사는 히어로가 대체
          .map(({ key, node }) => (
            <section
              key={key}
              className={`rounded-2xl border border-brand/10 bg-background p-5 shadow-card sm:p-6 ${FULL_WIDTH.has(key) ? "md:col-span-2" : ""}`}
            >
              {node}
            </section>
          ))}
      </div>

      <footer className="hairline pt-6 text-sm text-foreground-muted flex justify-between">
        <Link href="/me/onboarding" className="hover:text-brand">관심사 다시 설정</Link>
        <Link href="/" className="hover:text-brand">홈으로</Link>
      </footer>
    </div>
  );
}

function OnboardingPrompt() {
  return (
    <div className="max-w-xl mx-auto text-center space-y-4 py-12">
      <h1 className="text-2xl font-bold text-brand">초개인화 시작하기</h1>
      <p className="text-foreground-muted">
        관심 지역·분야를 알려주시면, 받는 정보를 내 관심사 위주로 재구성해드립니다.
        <br />2~3분 걸려요.
      </p>
      <Link
        href="/me/onboarding"
        className="inline-block bg-accent text-background px-6 py-3 rounded-lg font-semibold"
      >
        설정 시작 →
      </Link>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="py-12 text-center text-foreground-muted">불러오는 중...</div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="max-w-xl mx-auto py-12 text-center space-y-3">
      <p className="text-foreground-muted">정보를 불러오지 못했습니다.</p>
      <p className="text-xs text-red-600">{message}</p>
      <Link href="/" className="text-brand hover:underline">
        홈으로 돌아가기
      </Link>
    </div>
  );
}
