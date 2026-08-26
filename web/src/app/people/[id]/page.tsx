// 인물 한 사람 = 주소 하나.
//
//   왜 만들었나: 예전엔 인물 화면이 /people 안의 상태로만 있어서
//     ① 사람을 가리켜 보낼 주소가 없었고(공유·뒤로가기 불가)
//     ② 검색엔진이 인물 3만 4천 명을 한 쪽도 색인하지 못했다.
//   '사람 이름 검색'은 지역 언론의 가장 큰 유입 통로다 — 그 자리가 통째로 비어 있었다.
//
//   서버에서 프로필을 받아 넘긴다(제목·설명이 HTML에 실려야 검색엔진이 읽는다).
//   관계망은 캔버스라 클라이언트에서 그린다.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { PersonProfile } from "@/lib/api/kg";
import { PersonClient } from "./person-client";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";
export const revalidate = 900;

/**
 * 주소 조각을 원래 id로 되돌린다.
 *   ⚠ 실행 환경에 따라 `params.id`가 이미 풀린 'person:가세로'로 오기도 하고
 *     인코딩된 'person%3A...'로 오기도 한다. 그대로 다시 인코딩하면 %가 이중으로 걸려
 *     API가 못 찾는다(실측: 인물 페이지가 통째로 404였다). 한 번 풀고 다시 감싼다.
 */
function decodeId(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

async function load(rawId: string): Promise<PersonProfile | null> {
  const id = decodeId(rawId);
  try {
    const r = await fetch(`${API}/api/kg/person/${encodeURIComponent(id)}/profile`, { next: { revalidate: 900 } });
    return r.ok ? ((await r.json()) as PersonProfile) : null;
  } catch { return null; }
}

/** 활동 기간·직위로 한 줄 설명을 만든다 — 검색 결과에 뜨는 문장이라 사람 말이어야 한다. */
function describe(p: PersonProfile): string {
  const name = p.person?.name ?? "";
  const bits: string[] = [];
  const office = p.offices?.[0]?.office;
  if (office) bits.push(office);
  const years = p.timeline?.map((t) => t.year).filter(Boolean) ?? [];
  if (years.length) bits.push(`${Math.min(...years)}~${Math.max(...years)}년 기사 등장`);
  if (p.person?.mentions) bits.push(`기사 ${p.person.mentions.toLocaleString()}건`);
  const co = (p.coappear ?? []).slice(0, 3).map((c) => c.name).filter(Boolean);
  if (co.length) bits.push(`함께 등장 ${co.join("·")}`);
  return bits.length ? `${name} — ${bits.join(" · ")}` : `${name} — 태안신문 아카이브에 나온 인물`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const prof = await load(id);
  const name = prof?.person?.name;
  if (!name) return { title: "인물", robots: { index: false } };
  const title = `${name} — 태안신문 아카이브 인물`;
  const description = describe(prof!).slice(0, 155);
  return {
    title, description,
    alternates: { canonical: `/people/${encodeURIComponent(decodeId(id))}` },
    openGraph: { title, description, type: "profile", locale: "ko_KR", siteName: "태안 인사이트" },
  };
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prof = await load(id);
  if (!prof?.person) notFound();
  return <PersonClient prof={prof} summary={describe(prof)} />;
}
