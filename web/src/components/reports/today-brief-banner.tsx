// "오늘의 태안" 띠 — 아침 알림 한 줄의 **견본** + 푸시 옵트인(구독 전환).
//   ⚠ /live 에서는 날씨 칸 **아래**에 둔다. 맨 위에 두면 바로 밑에서 더 잘 보여줄 값(하늘·미세먼지·
//   물때)을 한 줄로 또 말해 중복으로 읽힌다(2026-10-12 사용자 지적). 그래서 제목 옆에 '견본'임을
//   밝혀, 같은 값이 다시 나오는 이유를 독자가 알게 한다.
//   보고→구독→매일 배달 깔때기의 입구. 서버 컴포넌트가 클라이언트 옵트인 버튼을 렌더.
//   2026-10 지금 태안 리디자인: 항목(" · ")을 나눠 읽기 쉽게, 글자는 본문 크기 이상.

import { PushOptInButton } from "@/components/me/push_opt_in";
import type { TodayBriefView } from "@/lib/api/reports";

export function TodayBriefBanner({ brief, vapidPublicKey }: { brief: TodayBriefView | null; vapidPublicKey?: string }) {
  if (!brief) return null;
  const items = brief.body.split(" · ").map((s) => s.trim()).filter(Boolean);
  return (
    <section aria-labelledby="today-brief-title" className="rounded-[18px] border border-ti-line bg-ti-surface p-5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 id="today-brief-title" className="font-head text-[1.2rem] font-bold text-ti-ink">{brief.title}</h2>
        <p className="text-[0.85rem] text-ti-muted">매일 아침 이렇게 한 줄로 보내드립니다</p>
      </div>
      <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-x-6 gap-y-1.5 p-0 text-[1.02rem] text-ti-ink">
        {items.map((t, i) => (
          <li key={i} className="relative pl-3.5 before:absolute before:left-0 before:top-[0.7em] before:h-[5px] before:w-[5px] before:rounded-full before:bg-ti-petrol">{t}</li>
        ))}
      </ul>
      <div className="mt-4 border-t border-ti-line pt-4">
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
