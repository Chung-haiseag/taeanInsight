"use client";

// 회차 머리 왼쪽 사진 한 칸.
//
//   왜 클라이언트 컴포넌트인가: 신문사 CDN 에 사진이 없는 기사가 섞인다(2026-11-07 실측 —
//   idxno 69385 의 사진이 404). 예전 배치에선 96×64 썸네일이라 티가 안 났는데, 모자이크에선
//   큰 칸이 통째로 빈 회색 상자 + 번호표로 남아 **우리 쪽이 고장난 것처럼** 보인다.
//   서버에서는 그 주소가 살아 있는지 알 수 없다 — 받아 보는 브라우저만 안다.
//   그래서 onError 때 칸을 통째로 접는다. 번호는 오른쪽 목록에 그대로 있으니 정보는 안 잃는다.

import { useBrokenImage } from "@/components/use-broken-image";

export function MosaicPhoto({ src, n, className }: { src: string; n: number; className?: string }) {
  // 하이드레이트 전에 실패한 사진까지 잡는 일은 use-broken-image.ts 한 군데에 모아 뒀다
  // (기사 화면의 사진도 같은 것을 쓴다 — 복사하면 한쪽만 고쳐진다).
  const { ref, broken, onError } = useBrokenImage();

  if (broken) return null;

  return (
    <figure className={`relative overflow-hidden bg-ti-sunk ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={onError}
        className="block aspect-[4/3] w-full object-cover"
      />
      <span
        aria-hidden
        className="absolute left-0 top-0 inline-flex h-6 w-6 items-center justify-center bg-ti-navy-deep text-xs font-bold tabular-nums text-ti-on-navy"
      >
        {n}
      </span>
    </figure>
  );
}
