"use client";

// 독자용 인물 탐색(공개·읽기 전용) — 아카이브 기사에서 AI가 자동 추출한 인물·공동등장.
//   ⚠️ 미검증 데이터. 관계 '라벨'은 검수(verified)된 것만 노출, 나머지는 '함께 등장'만 표시.
//   바이라인·초허브는 백엔드에서 제외됨. 관리자 도구(/admin/kg)와 분리된 공개 엔드포인트 사용.

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { searchPersonsPublic, getPersonProfilePublic, getKgStatus, getFeaturedPersons } from "@/lib/api/kg-public";
import { PersonProfileView } from "./person-view";
import { API_BASE_URL } from "@/lib/api/client";
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

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <PageHeader title="인물 탐색" description="아카이브 기사 속 인물과 함께 등장한 관계를 찾아봅니다." />

      {enabled === false ? (
        <div className="rounded-lg border border-brand/15 bg-background p-10 text-center text-sm text-foreground-muted">
          인물 탐색은 현재 준비 중입니다.
        </div>
      ) : (
        <>
      {/* 미검증 안내 — 크게 */}
      <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">⚠️ 실험 기능 · AI 자동 추출(미검증)</p>
        <p className="mt-1 leading-relaxed">
          아래 인물·관계는 AI가 <strong>기사에서 자동으로 뽑아낸</strong> 것으로 <strong>사람이 검증하지 않았습니다</strong>. ‘함께 등장’은 같은 기사에 나온 빈도일 뿐 실제 관계를 뜻하지 않습니다.
          관계 <strong>라벨</strong>은 <strong>실선=검수됨</strong>, <strong>점선=AI 추정(미검수)</strong>이며, 민감한 관계(대립·갈등·가족·인척)는 검수된 것만 표시합니다. 참고용으로만 보시고, 정확한 사실은 <Link href="/news" className="underline">기사 원문</Link>을 확인하세요.
        </p>
      </div>

      {/* 검색 */}
      <form onSubmit={search} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="인물 이름 (2자 이상)"
          className="flex-1 rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm"
          aria-label="인물 이름 검색"
        />
        <button type="submit" disabled={busy || q.trim().length < 2} className="btn-accent px-5 py-2 text-sm disabled:opacity-60">
          {busy ? "…" : "검색"}
        </button>
      </form>

      {/* 검색 결과 */}
      {!prof && searched && (
        hits.length === 0 ? (
          <p className="text-sm text-foreground-muted">{busy ? "검색 중…" : "해당 인물을 찾지 못했습니다."}</p>
        ) : (
          <ul className="divide-y divide-brand/10 rounded-lg border border-brand/15">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => void open(h.id)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-brand/5">
                  <span className="font-semibold text-brand">{h.name}</span>
                  <span className="text-xs text-foreground-muted">기사 {h.mentions.toLocaleString()}건</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {prof && <PersonProfileView prof={prof} onOpen={open} onShuffle={shuffle} onBack={() => setProf(null)} />}
        </>
      )}
    </div>
  );
}
