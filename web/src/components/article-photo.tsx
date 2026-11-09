"use client";

// 기사 안의 사진 한 장.
//
//   신문사 CDN 에 사진이 없는 기사가 섞인다(2026-11-07, idxno 69385 의 사진이 404).
//   깨진 상자를 그대로 두면 우리 쪽이 고장난 것처럼 보인다 — 그래서 통째로 접는다.
//
//   ⚠ 예전에는 <img onError> 로 `style.display='none'` 을 줬다. **그것만으로는 못 잡는다** —
//     서버가 그려 보낸 <img> 는 React 가 손을 대기 전에 이미 실패할 수 있고, 그 error 는
//     핸들러가 붙기 전에 지나가 버린다. 판정은 use-broken-image.ts 에 모아 뒀다.
//   ⚠ 사진이 깨지면 **사진설명도 같이 접는다.** 없는 사진을 설명하는 글만 남으면 더 이상하다.

import { useBrokenImage } from "@/components/use-broken-image";

export function ArticlePhoto({
  src, alt, maxWidth, caption, captionClassName,
}: {
  src: string;
  alt: string;
  /** CSS max-width 값(예: "min(100%, 54rem)") — 읽는 폭은 read-width.ts 가 정한다 */
  maxWidth: string;
  caption?: string;
  captionClassName?: string;
}) {
  const { ref, broken, onError } = useBrokenImage();
  if (broken) return null;

  return (
    <figure className="m-0 space-y-2.5">
      {/* 자연 크기로 둔다(작으면 작게) — 작은 사진을 늘리면 흐려진다. 상한만 건다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        className="mx-auto block h-auto rounded-xl bg-ti-sunk"
        style={{ maxWidth, maxHeight: "34rem" }}
        loading="lazy"
        decoding="async"
        onError={onError}
      />
      {caption && <figcaption className={captionClassName}>{caption}</figcaption>}
    </figure>
  );
}

/**
 * 목록의 작은 사진(썸네일). 깨지면 칸을 접고 글만 남긴다 — 빈 회색 네모가 줄줄이 서면
 * 아카이브가 비어 보인다. 판정은 큰 사진과 같은 것을 쓴다.
 */
export function ThumbPhoto({ src, className }: { src: string; className?: string }) {
  const { ref, broken, onError } = useBrokenImage();
  if (broken) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} alt="" className={className} loading="lazy" decoding="async" onError={onError} />;
}
