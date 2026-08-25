"use client";

// 내 페이지 — 멤버십 상태 한 줄.
//   회원이면 언제까지인지, 입금 대기면 어디에 넣어야 하는지, 아니면 안내로 잇는다.
//   여기서 상태를 못 보면 "돈은 냈는데 열렸는지 모르겠다"는 문의가 전화로 온다.

import Link from "next/link";
import { useMembership } from "@/lib/use-membership";

const won = (n: number) => n.toLocaleString("ko-KR");
const ymd = (s: string) => `${s.slice(0, 4)}. ${Number(s.slice(5, 7))}. ${Number(s.slice(8, 10))}.`;

export function MembershipStatus() {
  const { state, data } = useMembership();
  if (state === "loading" || state === "anonymous") return null;

  if (state === "member") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-subtle/25 px-4 py-3 text-sm">
        <span className="font-semibold text-brand">
          ✅ 멤버십 이용 중{data?.until && <span className="ml-1 font-normal text-foreground-muted">— {ymd(data.until)}까지</span>}
        </span>
        <Link href="/membership" className="text-xs text-foreground-muted underline hover:text-brand">멤버십 관리</Link>
      </div>
    );
  }

  // 입금 대기 — 계좌를 다시 찾아 헤매지 않도록 여기에도 적어 둔다.
  if (data?.pending) {
    return (
      <div className="rounded-xl border border-accent/40 bg-accent-subtle/25 px-4 py-3 text-sm">
        <p className="font-semibold text-brand">💳 입금을 기다리고 있습니다 — {won(data.pending.amount)}원</p>
        <p className="mt-1 text-foreground-muted">
          {data.bank ? <>입금처 <strong className="text-brand">{data.bank}</strong> · </> : null}
          입금자명 <strong className="text-brand">{data.pending.depositor}</strong> · 신청번호 {data.pending.code}
        </p>
        <Link href="/membership" className="mt-1 inline-block text-xs text-accent underline">입금 안내 다시 보기</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/15 bg-brand/[0.03] px-4 py-3 text-sm">
      <span className="text-foreground-muted">주간 리포트 전문과 사장님 보드는 멤버십(월 9,900원)에서 열립니다.</span>
      <Link href="/membership" className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-background">멤버십 보기</Link>
    </div>
  );
}
