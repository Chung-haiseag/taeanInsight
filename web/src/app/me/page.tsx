"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { renderWidgets } from "@/components/me/widget_registry";
import { ToneToggleBar, useToneToggle } from "@/components/me/tone_toggle";
import { PushOptInButton } from "@/components/me/push_opt_in";
import { canToggleTone, preferredTone, type MeResponse } from "@/lib/types";
import { getMe } from "@/lib/api/me";
import { getMockMeResponse, isMockMode } from "@/lib/mock/me";

export default function MePage() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp = isMockMode() ? getMockMeResponse() : await getMe();
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-brand">내 페이지</h1>
          <p className="text-sm text-foreground-muted">
            관심사 기반 초개인화 · 발행 콘텐츠는 모두 편집부 검토(HITL) 완료
          </p>
        </div>
        {showToneToggle && <ToneToggleBar tone={tone} onChange={setTone} />}
      </header>

      {/* Push 옵트인 — 알림 채널에 webpush 있으면 노출 */}
      {preferences.notificationChannels.includes("webpush") && (
        <PushOptInButton
          vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        />
      )}

      <div className="grid gap-6">
        {widgets.map(({ key, node }) => (
          <div key={key}>{node}</div>
        ))}
      </div>

      <footer className="pt-6 border-t border-brand/10 text-sm text-foreground-muted flex justify-between">
        <Link href="/me/onboarding" className="hover:text-brand">
          관심사 다시 설정
        </Link>
        <Link href="/" className="hover:text-brand">
          홈으로
        </Link>
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
