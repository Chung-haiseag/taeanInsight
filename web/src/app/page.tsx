"use client";

// 메인 홈 — 유료 회원 여부로 갈리는 세 화면
//  · anonymous (비로그인)      → 일반 홈
//  · preview   (로그인·미결제)  → 사장님 홈 블러 미리보기 + 멤버십 안내
//  · member    (유료 회원)      → 사장님 맞춤 홈
//
//   ⚠ 판정은 서버(`/api/membership/me`)가 한다. 예전엔 localStorage 값과 우하단 데모 토글이
//     정해서, 프로덕션에서 아무나 '구독' 상태를 켤 수 있었다(2026-08-25 제거).

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/icon";
import { GenericHome } from "@/components/home/generic-home";
import { OwnerHome } from "@/components/home/owner-home";
import { UpsellPaywall } from "@/components/home/upsell-paywall";
import { MOCK_ADDON } from "@/lib/mock/addons";
import { useMembership } from "@/lib/use-membership";

export default function HomePage() {
  // 유료 화면을 열지 말지는 **서버가 정한다**(세션 → /api/membership/me).
  //   예전엔 localStorage 값이 정해서 아무나 '구독' 상태가 될 수 있었다.
  const router = useRouter();
  const { state } = useMembership();

  // 확인 중에는 일반 홈 — 하이드레이션 전후 폭이 같아야 화면이 튀지 않는다.
  if (state === "loading")
    return (
      <div className="mx-auto max-w-[1200px] space-y-6">
        <GenericHome />
      </div>
    );

  return (
    <>
      {state === "member" && (
        <div className="mx-auto max-w-[1200px] space-y-6">
          <EntitledBanner />
          <OwnerHome />
        </div>
      )}

      {state === "preview" && (
        <div className="mx-auto max-w-[1200px] space-y-6">
          <PreviewBanner />
          {/* 결제는 멤버십 화면에서 — 예전엔 이 단추가 localStorage를 바꿔 그냥 열렸다. */}
          <UpsellPaywall product={MOCK_ADDON} onSubscribe={() => router.push("/membership")}>
            <OwnerHome blurred />
          </UpsellPaywall>
        </div>
      )}

      {state === "anonymous" && (
        <div className="mx-auto max-w-[1200px] space-y-6">
          <AnonymousBanner />
          <GenericHome />
        </div>
      )}
    </>
  );
}

function EntitledBanner() {
  return (
    <div className="flex items-center justify-between gap-3 bg-accent-subtle/40 border border-accent rounded-lg px-4 py-2 text-sm">
      <span className="text-brand">✅ 멤버십 이용 중 — 맞춤 수요 예측·실행 제안을 받습니다.</span>
      <Link href="/membership" className="text-xs text-foreground-muted underline hover:text-brand">
        멤버십 상태
      </Link>
    </div>
  );
}

function PreviewBanner() {
  return (
    <div className="bg-brand/5 border border-brand/15 rounded-lg px-4 py-2 text-sm text-foreground-muted">
      <Icon name="eye" /> <strong className="text-brand">미리보기</strong> — 사장님 맞춤 홈은 별도 구독(사장님 Pro)입니다. 아래에서 내 가게 화면을 확인하세요.
    </div>
  );
}

function AnonymousBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-brand/5 border border-brand/15 rounded-lg px-4 py-3 text-sm">
      <span className="text-foreground-muted">
        <Icon name="store" /> 펜션·식당·카페 사장님이세요? <strong className="text-brand">사장님 Pro</strong>로 주말 수요 예측과 실행 제안을 받아보세요.
      </span>
      <Link href="/me/onboarding" className="font-semibold text-accent hover:underline">
        시작하기 →
      </Link>
    </div>
  );
}
