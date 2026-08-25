"use client";

// 유료 회원인가 — **서버에 물어본다.**
//
//   ⚠ 예전에는 localStorage(`taean-demo-home-state`)가 답했다. 화면의 '구독' 단추가
//     그 값을 'entitled'로 바꾸면 유료 화면이 그냥 열렸다 — 결제 없이, 프로덕션에서.
//     판정은 세션 토큰으로 서버(`/api/membership/me`)가 하고, 서버는 만료일까지 본다.

import { useEffect, useState } from "react";
import { getMyMembership, type MyMembership } from "@/lib/api/membership";

export type MembershipState =
  | "loading"
  | "anonymous"   // 비로그인
  | "preview"     // 로그인했지만 유료 회원은 아님
  | "member";     // 유료 회원(기간 안)

export function useMembership(): { state: MembershipState; data: MyMembership | null; reload: () => void } {
  const [state, setState] = useState<MembershipState>("loading");
  const [data, setData] = useState<MyMembership | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    getMyMembership().then((m) => {
      if (!alive) return;
      setData(m);
      setState(!m ? "anonymous" : m.member ? "member" : "preview");
    });
    return () => { alive = false; };
  }, [nonce]);

  return { state, data, reload: () => setNonce((n) => n + 1) };
}
