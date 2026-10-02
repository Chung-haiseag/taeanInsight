"use client";

// 독자용 인물 탐색(공개·읽기 전용) — 아카이브 기사에서 AI가 자동 추출한 인물·공동등장.
//   ⚠️ 미검증 데이터. 관계 '라벨'은 검수(verified)된 것만 노출, 나머지는 '함께 등장'만 표시.
//   바이라인·초허브는 백엔드에서 제외됨. 관리자 도구(/admin/kg)와 분리된 공개 엔드포인트 사용.

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/editorial";
import { searchPersonsPublic, getPersonProfilePublic, getKgStatus, getFeaturedPersons } from "@/lib/api/kg-public";
import { PersonProfileView } from "./person-view";
import type { PersonSearchResult, PersonProfile } from "@/lib/api/kg";

export default function PeoplePage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PersonSearchResult[]>([]);
  const [prof, setProf] = useState<PersonProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  // 첫 화면에 띄울 인물 후보 — 빈 검색창만 있으면 무엇을 칠지 모르는 사람은 되돌아간다.
  //   들어오자마자 관계망 하나를 보여줘 '이런 걸 볼 수 있구나'를 먼저 전한다.
  const [featured, setFeatured] = useState<PersonSearchResult[]>([]);
  useEffect(() => { getKgStatus().then((s) => setEnabled(s.enabled)).catch(() => setEnabled(true)); }, []);

  // 처음 들어왔을 때 한 번만 — 검색·조회를 이미 했다면 건드리지 않는다.
  useEffect(() => {
    if (enabled === false) return;
    let alive = true;
    getFeaturedPersons().then((list) => {
      if (!alive || !list.length) return;
      setFeatured(list);
      // 올 때마다 다른 사람이 보이게 무작위로 고른다.
      void openId(list[Math.floor(Math.random() * list.length)].id, false);
    });
    return () => { alive = false; };
    // enabled가 정해진 뒤 한 번만 돈다(검색 상태를 의존성에 넣으면 검색할 때마다 덮어쓴다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function shuffle() {
    if (!featured.length) return;
    const pick = featured[Math.floor(Math.random() * featured.length)];
    void openId(pick.id, true);
  }

  async function search(e?: FormEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    setBusy(true);
    setSearched(true);
    setProf(null);
    try {
      setHits((await searchPersonsPublic(query)).results);
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  }

  async function openId(id: string, scroll: boolean) {
    setBusy(true);
    try {
      setProf(await getPersonProfilePublic(id));
      // 첫 진입에는 스크롤하지 않는다 — 사용자가 아직 아무것도 안 눌렀는데 화면이 움직이면 놀란다.
      if (scroll && typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setProf(null);
    } finally {
      setBusy(false);
    }
  }
  // 사람을 고르면 **그 사람의 주소로 간다** — 인라인으로만 열면 공유도 색인도 안 된다.
  //   첫 화면의 무작위 관계망만 인라인으로 띄운다(맛보기라 주소를 바꾸지 않는다).
  const open = (id: string) => router.push(`/people/${encodeURIComponent(id)}`);

  const canSearch = q.trim().length >= 2;

  // 2026-10 리디자인(가독성) — 지금 태안·홈과 같은 체계(ti 토큰·세리프 제목).
  //   흐름: 머리 → 주의 안내 → 이름 찾기(보이는 이름표·큰 입력칸) → 결과 목록 → 인물 화면(맛보기).
  return (
    <div className="mx-auto max-w-[1200px] space-y-8 text-ti-ink">
      <PageHeader eyebrow="태안신문 아카이브" title="인물 탐색" description="아카이브 기사 속 인물과 함께 등장한 관계를 찾아봅니다." />

      {enabled === false ? (
        <p className="rounded-[18px] border border-ti-line bg-ti-surface p-8 text-center text-[1.05rem] text-ti-ink2">
          인물 탐색은 현재 준비 중입니다.
        </p>
      ) : (
        <>
      {/* 미검증 안내 — 크게. 색만이 아니라 '주의'라는 글로 먼저 말한다. */}
      <section role="note" aria-labelledby="people-caution" className="rounded-[14px] border-2 border-[#9A5B00] bg-[#FFF4DF] p-4 md:p-5">
        <h2 id="people-caution" className="text-[1.1rem] font-bold text-[#6B3F00]">주의 — AI가 자동으로 뽑은 자료입니다(사람이 검증하지 않음)</h2>
        <p className="mt-1.5 leading-relaxed text-[#1A1203]">
          아래 인물·관계는 AI가 <strong>기사에서 자동으로 뽑아낸</strong> 것으로 <strong>사람이 검증하지 않았습니다</strong>. ‘함께 등장’은 같은 기사에 나온 빈도일 뿐 실제 관계를 뜻하지 않습니다.
          관계 <strong>라벨</strong>은 <strong>실선=검수됨</strong>, <strong>점선=AI 추정(미검수)</strong>이며, 민감한 관계(대립·갈등·가족·인척)는 검수된 것만 표시합니다. 참고용으로만 보시고, 정확한 사실은 <Link href="/news" className="font-semibold underline underline-offset-4">기사 원문</Link>을 확인하세요.
        </p>
      </section>

      {/* 검색 — 이름표를 눈에 보이게(자리표시 글자는 입력하면 사라져 무엇을 넣는 칸인지 잊는다). */}
      <section aria-labelledby="people-search-title">
        <form onSubmit={search} role="search" className="rounded-[18px] border border-ti-line bg-ti-surface p-5">
          <label id="people-search-title" htmlFor="people-q" className="block text-[1.08rem] font-bold text-ti-ink">인물 이름으로 찾기</label>
          <p id="people-q-hint" className="mt-1 text-[0.95rem] text-ti-ink2">두 글자 이상 넣고 ‘찾기’를 누르세요. 예: 군수·군의원 이름</p>
          <div className="mt-3 flex flex-col gap-2 md:flex-row">
            <input
              id="people-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="인물 이름"
              aria-describedby="people-q-hint"
              autoComplete="off"
              className="min-h-12 flex-1 rounded-[12px] border-2 border-ti-line bg-ti-surface px-4 text-[1.08rem] text-ti-ink placeholder:text-ti-muted focus:border-ti-petrol"
            />
            <button type="submit" disabled={busy || !canSearch} className="btn-primary min-h-12 px-7 text-[1.05rem] disabled:opacity-60">
              {busy ? "찾는 중" : "찾기"}
            </button>
          </div>
        </form>

        {/* 검색 결과 — 몇 명 찾았는지 화면낭독기에도 알린다. */}
        {!prof && searched && (
          <div className="mt-5">
            <p role="status" className="mb-3 text-[1.02rem] text-ti-ink2">
              {busy ? "찾는 중입니다…" : hits.length === 0 ? "해당 인물을 찾지 못했습니다. 이름을 다시 확인해 주세요." : <>찾은 인물 <b className="font-display tabular-nums text-ti-ink">{hits.length}</b>명 — 이름을 누르면 그 사람 화면으로 갑니다.</>}
            </p>
            {hits.length > 0 && (
              <ul className="m-0 list-none divide-y divide-ti-line overflow-hidden rounded-[18px] border border-ti-line bg-ti-surface p-0">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => void open(h.id)} className="flex min-h-14 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-left hover:bg-ti-sunk">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[1.1rem] font-bold text-ti-ink">{h.name}</span>
                        {/* 이름이 같은 두 사람이 나란히 뜨면 고를 수가 없다 — 갈래를 이름 옆에 붙인다. */}
                        {h.qualifier && <Pill tone="plain">{h.qualifier}</Pill>}
                      </span>
                      <span className="text-ti-ink2">
                        기사 <span className="font-display text-[1.15rem] font-semibold tabular-nums text-ti-ink">{h.mentions.toLocaleString()}</span>건
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {prof && <PersonProfileView prof={prof} onOpen={open} onShuffle={shuffle} onBack={() => setProf(null)} />}
        </>
      )}
    </div>
  );
}
