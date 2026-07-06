"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-20 text-center sm:py-28">
      <p className="eyebrow justify-center"><span className="inline-block h-px w-6 bg-accent" aria-hidden /> 오류</p>
      <h1 className="mt-4 font-display text-display-sm text-brand">잠시 문제가 생겼습니다</h1>
      <p className="mx-auto mt-3 max-w-prose text-foreground-muted">
        요청을 처리하지 못했습니다. 다시 시도해 주세요. 계속되면 잠시 후 새로고침 해 주세요.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => reset()} className="btn-accent">다시 시도</button>
        <Link href="/" className="btn-ghost">홈으로</Link>
      </div>
    </div>
  );
}
