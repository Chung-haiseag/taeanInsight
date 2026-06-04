"use client";

// 메인 홈 — 초개인화 게이트
//  · anonymous (비로그인)        → 일반 홈 + 개인화 안내
//  · preview   (로그인·미구독)   → 블러 미리보기 + 페이월 업셀
//  · entitled  (초개인화 구독)   → 초개인화 홈
// 데모는 mock 상태를 localStorage로 전환(우하단 토글). 실서비스는 /api/addons/me 로 판정.

import { useEffect, useState } from "react";
import Link from "next/link";

import { GenericHome } from "@/components/home/generic-home";
import { PersonalizedHome } from "@/components/home/personalized-home";
import { UpsellPaywall } from "@/components/home/upsell-paywall";
import { mockPreferences, mockFavorites } from "@/lib/mock/me";
import {
  MOCK_ADDON,
  getDemoHomeState,
  setDemoHomeState,
  isMockMode,
  type DemoHomeState,
} from "@/lib/mock/addons";

export default function HomePage() {
  const [state, setState] = useState<DemoHomeState | null>(null);

  useEffect(() => {
    setState(getDemoHomeState());
  }, []);

  // 초기 렌더(SSR/하이드레이션 전)는 일반 홈
  if (state === null) return <GenericHome />;

  const prefs = mockPreferences();
  const favorites = mockFavorites();

  function subscribe() {
    // 데모: 결제 성공 가정 → 구독 상태로 전환. 실서비스는 subscribeAddon() 호출.
    setDemoHomeState("entitled");
    setState("entitled");
  }

  return (
    <>
      {state === "entitled" && (
        <div className="space-y-6">
          <EntitledBanner onCancel={() => { setDemoHomeState("preview"); setState("preview"); }} />
          <PersonalizedHome prefs={prefs} favorites={favorites} />
        </div>
      )}

      {state === "preview" && (
        <div className="space-y-6">
          <PreviewBanner />
          <UpsellPaywall product={MOCK_ADDON} onSubscribe={subscribe}>
            <PersonalizedHome prefs={prefs} favorites={favorites} blurred />
          </UpsellPaywall>
        </div>
      )}

      {state === "anonymous" && (
        <div className="space-y-6">
          <AnonymousBanner />
          <GenericHome />
        </div>
      )}

      {isMockMode() && <DemoToggle state={state} onChange={(s) => { setDemoHomeState(s); setState(s); }} />}
    </>
  );
}

function EntitledBanner({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-accent-subtle/40 border border-accent rounded-lg px-4 py-2 text-sm">
      <span className="text-brand">✅ 초개인화 홈 구독 중 — 첫 화면이 내 관심사로 구성됩니다.</span>
      <button type="button" onClick={onCancel} className="text-xs text-foreground-muted underline hover:text-brand">
        구독 해지(데모)
      </button>
    </div>
  );
}

function PreviewBanner() {
  return (
    <div className="bg-brand/5 border border-brand/15 rounded-lg px-4 py-2 text-sm text-foreground-muted">
      👀 <strong className="text-brand">미리보기</strong> — 초개인화 홈은 별도 구독 상품입니다. 아래에서 내 화면이 어떻게 바뀌는지 확인하세요.
    </div>
  );
}

function AnonymousBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-brand/5 border border-brand/15 rounded-lg px-4 py-3 text-sm">
      <span className="text-foreground-muted">
        🔓 로그인하면 <strong className="text-brand">초개인화 홈</strong>(별도 구독)으로 첫 화면을 받을 수 있어요.
      </span>
      <Link href="/me/onboarding" className="font-semibold text-accent hover:underline">
        시작하기 →
      </Link>
    </div>
  );
}

// 데모 전용: 세 상태 전환 토글
function DemoToggle({ state, onChange }: { state: DemoHomeState; onChange: (s: DemoHomeState) => void }) {
  const options: { key: DemoHomeState; label: string }[] = [
    { key: "anonymous", label: "비로그인" },
    { key: "preview", label: "미구독" },
    { key: "entitled", label: "구독" },
  ];
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-brand text-background rounded-lg shadow-lg p-2 text-xs">
      <p className="px-1 pb-1 text-background/70">데모 상태</p>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={state === o.key}
            className={`px-2 py-1 rounded ${state === o.key ? "bg-accent text-background" : "bg-background/10 text-background/80"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
