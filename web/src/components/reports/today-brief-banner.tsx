// "오늘의 태안" 상단 배너 — 오늘의 한 줄(가치 노출) + 매일 아침 푸시 옵트인(구독 전환).
//   보고→구독→매일 배달 깔때기의 입구. 서버 컴포넌트가 클라이언트 옵트인 버튼을 렌더.

import { PushOptInButton } from "@/components/me/push_opt_in";
import type { TodayBriefView } from "@/lib/api/reports";

export function TodayBriefBanner({ brief, vapidPublicKey }: { brief: TodayBriefView | null; vapidPublicKey?: string }) {
  if (!brief) return null;
  return (
    <section className="mt-6 rounded-2xl border border-accent/30 bg-accent-subtle/20 p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="text-xl leading-none" aria-hidden>📣</span>
        <div className="flex-1">
          <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-accent">{brief.title}</p>
          <p className="mt-1 text-[0.95rem] font-medium leading-relaxed text-foreground">{brief.body}</p>
        </div>
      </div>
      <div className="mt-3">
        <PushOptInButton
          vapidPublicKey={vapidPublicKey}
          label="매일 아침 ‘오늘의 태안’ 무료로 받기"
          description="날씨·미세먼지·물때·행사·뉴스 한 줄. 사이트를 안 열어도 매일 아침 알림이 옵니다. 언제든 끌 수 있어요."
          subscribedText="✅ 매일 아침 ‘오늘의 태안’을 보내드립니다."
        />
      </div>
    </section>
  );
}
