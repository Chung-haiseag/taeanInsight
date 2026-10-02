"use client";

// 인물 개별 주소의 클라이언트 껍데기 — 서버가 받아 온 프로필을 그대로 그리고,
//   관계망에서 다른 사람을 누르면 그 사람의 주소로 옮겨 간다(주소가 늘 사람을 가리키게).

import { useRouter } from "next/navigation";

import { PersonProfileView } from "../person-view";
import type { PersonProfile } from "@/lib/api/kg";

export function PersonClient({ prof, summary }: { prof: PersonProfile; summary: string }) {
  const router = useRouter();
  // 이 주소의 유일한 h1은 인물 이름 — 검색엔진용 한 줄은 이름 바로 밑에 둔다(사람에게도 '누구인지'를 먼저 알려준다).
  return (
    <div className="mx-auto max-w-[1200px]">
      <PersonProfileView prof={prof} headingLevel={1} summary={summary} onOpen={(id) => router.push(`/people/${encodeURIComponent(id)}`)} />
    </div>
  );
}
