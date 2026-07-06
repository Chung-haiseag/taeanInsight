import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center sm:py-28">
      <p className="eyebrow justify-center"><span className="inline-block h-px w-6 bg-accent" aria-hidden /> 404</p>
      <h1 className="mt-4 font-display text-display-sm text-brand">페이지를 찾을 수 없습니다</h1>
      <p className="mx-auto mt-3 max-w-prose text-foreground-muted">
        주소가 바뀌었거나 삭제된 기사일 수 있습니다. 아래에서 다시 시작해 주세요.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-accent">홈으로</Link>
        <Link href="/news" className="btn-ghost">태안뉴스 보기</Link>
      </div>
    </div>
  );
}
