"use client";

// 깨진 사진을 **하이드레이트 전에 실패한 것까지** 잡아낸다.
//
//   왜 onError 만으로는 못 잡나: 서버가 그려 보낸 <img> 는 React 가 손을 대기 전에 이미 받아 보고
//   실패할 수 있다. 그 error 이벤트는 핸들러가 붙기 전에 지나가 버린다 — 그래서 아무 일도 안 일어나고
//   깨진 상자만 남는다. 2026-11-07 실측으로 확인했다(complete=true, naturalWidth=0 인데 칸이 그대로).
//   마운트 때 한 번 직접 묻는다: 다 받았는데(complete) 폭이 0 이면 깨진 것이다.
//
//   왜 숨기나: 신문사 CDN 에 사진이 없는 기사가 섞인다(2026-11-07, idxno 69385 의 사진이 404).
//   깨진 상자를 그대로 두면 **우리 쪽이 고장난 것처럼** 보인다.

import { useEffect, useRef, useState } from "react";

export function useBrokenImage() {
  const ref = useRef<HTMLImageElement>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setBroken(true);
  }, []);
  return { ref, broken, onError: () => setBroken(true) };
}
