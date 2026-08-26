"use client";

// 인물 개별 주소의 클라이언트 껍데기 — 서버가 받아 온 프로필을 그대로 그리고,
//   관계망에서 다른 사람을 누르면 그 사람의 주소로 옮겨 간다(주소가 늘 사람을 가리키게).

import { useRouter } from "next/navigation";

import { PersonProfileView } from "../person-view";
import type { PersonProfile } from "@/lib/api/kg";

export function PersonClient({ prof, summary }: { prof: PersonProfile; summary: string }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      {/* 검색엔진이 읽는 한 줄. 사람에게도 '이 사람이 누구인지'를 먼저 알려준다. */}
      <p className="pt-2 text-sm text-foreground-muted">{summary}</p>
      <PersonProfileView prof={prof} onOpen={(id) => router.push(`/people/${encodeURIComponent(id)}`)} />
    </div>
  );
}
