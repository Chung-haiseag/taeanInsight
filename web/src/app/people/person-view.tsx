"use client";

// 인물 상세 화면 — 검색 결과에서도, 개별 주소(/people/<id>)에서도 같은 것을 보여준다.
//
//   왜 갈라냈나: 예전엔 이 화면이 /people 안의 상태로만 있었다. 그래서
//     ① 인물 하나를 **주소로 가리킬 수 없었고**(공유 불가·뒤로가기 불가)
//     ② 검색엔진이 인물 3만 4천 명을 한 쪽도 색인할 수 없었다.
//   사람 이름 검색은 지역 언론의 가장 큰 유입 통로라, 이게 통째로 비어 있었다.

import { useState, useEffect } from "react";
import Link from "next/link";

import KgGraph from "@/components/kg-graph";
import { getPersonBriefPublic, type WikiSummary } from "@/lib/api/kg-public";
import { API_BASE_URL } from "@/lib/api/client";
import type { PersonProfile } from "@/lib/api/kg";

export function PersonProfileView({ prof, onOpen, onShuffle, onBack }: {
  prof: PersonProfile;
  onOpen: (id: string) => void;
  /** 없으면 '다른 인물 보기' 단추를 숨긴다(개별 주소 화면에는 뜻이 없다). */
  onShuffle?: () => void;
  /** 검색 결과 안에서 열렸을 때만 — 없으면 목록으로 가는 링크를 보여준다. */
  onBack?: () => void;
}) {
  if (!prof.person) return null;
  return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {prof.photo && (
              // 역대 군수·현직 군의원 공식 사진(R2). 로드 실패 시 조용히 숨김.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={prof.photo.startsWith("http") ? prof.photo : `${API_BASE_URL}${prof.photo}`} alt={prof.person.name}
                className="h-16 w-16 shrink-0 rounded-full border border-brand/15 object-cover"
                loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <div>
              <h2 className="text-2xl font-bold text-brand">
                {prof.person.name}
                {prof.person.qualifier && (
                  // 이름만으로는 누구인지 알 수 없는 갈래(동명이인 분리) — 이름 옆에 바로 붙인다.
                  <span className="ml-2 rounded bg-brand/10 px-2 py-0.5 align-middle text-sm font-semibold text-brand">
                    {prof.person.qualifier}
                  </span>
                )}
                {prof.nec?.hanja && <span className="ml-2 text-lg font-normal text-foreground-muted">{prof.nec.hanja}</span>}
                {prof.nec?.birthYear && <span className="ml-2 text-sm font-normal text-foreground-muted">({prof.nec.birthYear}년생)</span>}
              </h2>
              <p className="text-xs text-foreground-muted">
                {prof.nec && prof.nec.total > 0 && (
                  <>
                    출마 {prof.nec.total}회
                    {prof.nec.wins > 0 && ` · 당선 ${prof.nec.wins}회`}
                    {prof.nec.span && ` · 활동 ${prof.nec.span}`}
                    {" · "}
                  </>
                )}
                아카이브 등장 {prof.person.mentions.toLocaleString()}건
              </p>
            </div>
          </div>
          {onBack
            ? <button type="button" onClick={onBack} className="shrink-0 text-sm text-accent underline">← 검색으로</button>
            : <Link href="/people" className="shrink-0 text-sm text-accent underline">← 인물 탐색</Link>}
        </div>

        <PersonIntro prof={prof} />

        <SameNameCard prof={prof} onOpen={onOpen} />

        {prof.nec && prof.nec.total > 0 && <CandidacyTable nec={prof.nec} />}

        {prof.offices.length > 0 && (
          <section className="rounded-lg border border-brand/15 bg-background p-4">
            <h3 className="mb-2 text-sm font-bold text-brand">직위·소속 <span className="font-normal text-foreground-muted">(검증됨)</span></h3>
            <ul className="space-y-1 text-sm">
              {prof.offices.map((o, i) => (
                <li key={i}>· {o.office}{o.ordinal ? ` (${o.ordinal}대)` : ""}{o.start ? ` · ${o.start}${o.end ? `~${o.end}` : "~"}` : ""}</li>
              ))}
            </ul>
          </section>
        )}

        {!!prof.affiliations?.length && (
          <section className="rounded-lg border border-brand/15 bg-background p-4">
            <h3 className="mb-2 text-sm font-bold text-brand">
              소속
            </h3>
            {/* ⚠ 예전엔 '(검증됨)'이라고만 적어, 기사 한 줄에서 잘못 뽑힌 직함까지 확정 사실로 읽혔다
                 (김영인 군의원에게 '태안군청 군수'가 붙었다). 무엇을 근거로 한 줄인지 줄마다 밝힌다. */}
            <p className="mb-2 text-[0.6875rem] text-foreground-muted">
              ‘기사 N건’은 그 직함으로 나온 <strong>기사 수</strong>, 연도는 <strong>기사에 나온 해</strong>입니다.
              재임 기간은 위 ‘직위·소속’을, 정당은 ‘출마 이력’을 보세요.
            </p>
            <ul className="space-y-1 text-sm">
              {prof.affiliations.map((a) => (
                <li key={a.orgId}>
                  · {a.org}
                  {a.role && <span className="text-foreground-muted"> {a.role}</span>}
                  {/* 기사에서 뽑은 연도는 **재임 기간이 아니라 기사에 나온 해**다.
                       그냥 '2006~2025'로 찍었더니 19년 재임처럼 읽혔다(한상기 실제 재임 2014~2018). */}
                  <span className="text-xs text-foreground-muted">
                    {a.fromArticles
                      ? <>{" · 기사 "}{(a.count ?? 0).toLocaleString()}건{a.years && <>{" · "}{a.years}</>}</>
                      : <>{" · 선관위"}{a.years && <>{" "}{a.years}</>}</>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {prof.graph.nodes.length > 0 && <RelationGraph prof={prof} onOpen={onOpen} onShuffle={onShuffle} />}

        {prof.coappear.length > 0 && (
          <section className="rounded-lg border border-brand/15 bg-background p-4">
            <h3 className="mb-2 text-sm font-bold text-brand">함께 등장한 인물</h3>
            <ul className="flex flex-wrap gap-2 text-sm">
              {prof.coappear.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => void open(c.id)} className="rounded-full border border-brand/15 bg-brand/5 px-3 py-1 hover:bg-brand/10">
                    {c.name} <span className="text-xs text-foreground-muted">{c.count}회</span>
                    {c.verified === 1 && c.reltype ? <span className="ml-1 rounded bg-accent/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-accent">{c.reltype}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.6875rem] text-foreground-muted">‘회’는 같은 기사 공동 등장 빈도(관계 아님). 라벨은 검수된 관계만.</p>
          </section>
        )}

        {prof.timeline.length > 0 && (
          <section className="rounded-lg border border-brand/15 bg-background p-4">
            <h3 className="mb-2 text-sm font-bold text-brand">시기별 등장</h3>
            <div className="flex items-end gap-1" style={{ height: 80 }}>
              {(() => {
                const max = Math.max(...prof.timeline.map((t) => t.count), 1);
                return prof.timeline.map((t) => (
                  <div key={t.year} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${t.year}년 ${t.count}건`}>
                    <div className="w-full rounded-t bg-accent/70" style={{ height: `${Math.round((t.count / max) * 64)}px` }} />
                    <span className="text-[9px] text-foreground-muted">{String(t.year).slice(2)}</span>
                  </div>
                ));
              })()}
            </div>
          </section>
        )}

        {prof.articles.length > 0 && (
          <section className="rounded-lg border border-brand/15 bg-background p-4">
            <h3 className="mb-2 text-sm font-bold text-brand">나온 기사 <span className="font-normal text-foreground-muted">(최신 {prof.articles.length})</span></h3>
            <ul className="space-y-1.5 text-sm">
              {prof.articles.map((a) => (
                <li key={a.idxno} className="flex items-baseline gap-2">
                  <span className="shrink-0 text-[0.6875rem] text-foreground-muted">{a.published_at?.slice(0, 10)}</span>
                  <Link href={`/news/${a.idxno}`} className="text-accent hover:underline">{a.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
  );
}

// ── 같은 이름의 다른 인물 ───────────────────────────────────────
// 지역지에서 동명이인은 흔하다. 소원면 주민자치위원장 '박정희'와 전 대통령이 한 사람으로 묶여
//   전직 대통령 얼굴이 지역 인물에게 걸렸던 사고에서 나왔다(2026-08-27).
//   본문은 **지역 인물**이 주인공이고, 겹치는 다른 사람은 얼굴·한 줄 소개로 여기서 갈라 준다.
function SameNameCard({ prof, onOpen }: { prof: PersonProfile; onOpen?: (id: string) => void }) {
  const alts = prof.sameName ?? [];
  if (!alts.length) return null;
  return (
    <section className="rounded-lg border border-brand/20 bg-brand/[0.03] p-4">
      <h3 className="mb-2 text-sm font-bold text-brand">같은 이름의 다른 인물</h3>
      <ul className="space-y-2">
        {alts.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => onOpen?.(a.id)}
              className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-brand/5">
              {a.photo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={a.photo} alt="" className="h-11 w-11 shrink-0 rounded-full border border-brand/15 object-cover"
                    loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                : <span aria-hidden className="h-11 w-11 shrink-0 rounded-full border border-brand/15 bg-brand/5" />}
              <span className="min-w-0">
                <span className="block text-sm">
                  <strong className="text-brand">{a.name}</strong>
                  <span className="ml-1.5 text-foreground-muted">— {a.qualifier ?? "지역 인물"}</span>
                </span>
                {a.extract && <span className="mt-0.5 line-clamp-2 block text-xs text-foreground-muted">{a.extract}</span>}
                <span className="mt-0.5 block text-xs text-foreground-muted">기사 {a.mentions.toLocaleString()}건 보기 →</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1 px-2 text-[0.6875rem] text-foreground-muted">
        이름이 같을 뿐 <strong>다른 사람</strong>입니다. 기사 본문의 쓰임으로 갈랐으며, 애매한 기사는 지역 인물 쪽에 남겨 둡니다.
      </p>
    </section>
  );
}

// ── 인물 소개(기사 근거 AI 전기 + 확정 팩트 스트립) ─────────────
const TOPIC_NOISE = new Set(["개최", "대상", "성황", "성료", "실시", "위한", "한다", "선정", "진행"]);
// 한 덩어리 소개글을 읽기 좋게 문단 분할 — 첫 문장은 리드(누구인가), 이후는 2문장씩 묶어 문단으로.
/**
 * 출마 이력 — 선거일·선거구·정당·직업·결과. 선관위 후보자·당선인 자료가 근거다.
 *   ⚠ 결과를 모르는 회차는 **빈 칸이 아니라 '모름'** 으로 적는다. 빈 칸은 낙선처럼 보인다.
 */
function CandidacyTable({ nec }: { nec: NonNullable<PersonProfile["nec"]> }) {
  const anyJob = nec.runs.some((r) => r.job);
  return (
    <section className="rounded-lg border border-brand/15 bg-background p-4">
      <h3 className="mb-1 text-sm font-bold text-brand">
        출마 이력 <span className="font-normal text-foreground-muted">(중앙선거관리위원회)</span>
      </h3>
      <p className="mb-3 text-xs text-foreground-muted">후보자 본인이 신고하고 선관위가 공고한 자료입니다.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-brand/15 text-left text-xs text-foreground-muted">
              <th className="py-1 pr-3 font-semibold">선거일</th>
              <th className="py-1 pr-3 font-semibold">선거</th>
              <th className="py-1 pr-3 font-semibold">선거구</th>
              <th className="py-1 pr-3 font-semibold">정당</th>
              {anyJob && <th className="py-1 pr-3 font-semibold">직업</th>}
              <th className="py-1 font-semibold">결과</th>
            </tr>
          </thead>
          <tbody>
            {nec.runs.map((r) => (
              <tr key={`${r.sgId}${r.kind}`} className="border-b border-brand/5 last:border-0">
                <td className="py-1.5 pr-3 tabular-nums">
                  {r.date}
                  {r.assumed && <span className="ml-1 text-xs text-foreground-muted" title="생년월일이 없어 이름으로 맞춘 기록입니다">추정</span>}
                </td>
                <td className="py-1.5 pr-3">{r.kind}</td>
                <td className="py-1.5 pr-3 text-foreground-muted">{r.district || "—"}</td>
                <td className="py-1.5 pr-3">{r.party || "—"}</td>
                {anyJob && <td className="py-1.5 pr-3 text-foreground-muted">{r.job || "—"}</td>}
                <td className="py-1.5">
                  {r.result === "당선" ? (
                    <span className="font-bold text-brand">당선</span>
                  ) : r.result === "낙선" ? (
                    <span className="text-foreground-muted">낙선</span>
                  ) : (
                    <span className="text-foreground-muted" title="당선자 자료를 받지 못한 회차입니다">모름</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!!nec.careers?.length && (
        <div className="mt-3 border-t border-brand/10 pt-3">
          <p className="mb-1 text-xs font-semibold text-brand">신고 경력</p>
          <ul className="space-y-0.5 text-sm text-foreground-muted">
            {nec.careers.map((c, i) => (
              <li key={i}>· {c.tense ? `(${c.tense}) ` : ""}{c.text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function briefParagraphs(text: string): string[] {
  const s = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  if (s.length <= 2) return s;
  const paras = [s[0]];
  for (let i = 1; i < s.length; i += 2) paras.push(s.slice(i, i + 2).join(" "));
  return paras;
}
function PersonIntro({ prof }: { prof: PersonProfile }) {
  const pid = prof.graph.center?.id;
  const [brief, setBrief] = useState<string | null | undefined>(undefined); // undefined=로딩, null=근거부족
  const [suppressed, setSuppressed] = useState(false); // 전국 인물 등 AI 소개 억제
  const [wiki, setWiki] = useState<WikiSummary | null>(null); // 억제 시 위키백과 요약 대체
  const [byline, setByline] = useState(false); // 초허브(기자·편집인) — 소개 억제
  useEffect(() => {
    let alive = true;
    setBrief(undefined); setSuppressed(false); setWiki(null); setByline(false);
    if (!pid) { setBrief(null); return; }
    getPersonBriefPublic(pid).then((r) => { if (alive) { setBrief(r.brief); setSuppressed(!!r.suppressed); setWiki(r.wiki ?? null); setByline(!!r.byline); } }).catch(() => { if (alive) setBrief(null); });
    return () => { alive = false; };
  }, [pid]);

  if (!prof.person) return null;
  const office = prof.offices[0];
  const years = prof.timeline.length ? `${prof.timeline[0].year}~${prof.timeline[prof.timeline.length - 1].year}` : null;
  const topCo = prof.coappear.slice(0, 3).map((c) => c.name);
  const desc = office ? `${office.office}${office.ordinal ? `(${office.ordinal}대)` : ""}` : null;
  const topics = prof.topics.map((t) => t.term).filter((t) => !TOPIC_NOISE.has(t)).slice(0, 6);
  // 최신 기사 날짜 — 소개가 '언제까지의' 자료인지 독자에게 명시(오래돼 보이는 오해 방지).
  const latestAt = prof.articles[0]?.published_at ?? null;
  const latestArt = latestAt ? latestAt.slice(0, 10).replace(/-/g, ".") : null;
  const staleMonths = latestAt ? Math.floor((Date.now() - new Date(latestAt).getTime()) / (30 * 864e5)) : 0;

  return (
    <section className="rounded-lg border border-brand/20 bg-accent/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-bold text-brand">인물 소개</h3>
        {suppressed
          ? (wiki && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[0.625rem] font-semibold text-brand">위키백과 요약</span>)
          : <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[0.625rem] font-semibold text-brand">AI 요약 · 기사 근거</span>}
      </div>
      {/* AI 전기 — 지연 로드. 전국 인물 등 억제 대상은 로컬 AI 소개 대신 위키백과 요약(있으면)·안내. 팩트·관계망은 유지. */}
      {suppressed ? (
        byline ? (
          <p className="text-sm leading-relaxed text-foreground-muted">
            이 인물은 기사 작성자(기자·편집인)로 보여 인물 소개를 제공하지 않습니다. ‘아카이브 등장’ 수는 대체로 이 사람이 <strong>쓴 기사</strong> 수입니다.
          </p>
        ) : wiki ? (
          <div className="space-y-2">
            <p className="text-sm leading-relaxed text-foreground">{wiki.extract}</p>
            <p className="text-[0.6875rem] text-foreground-muted">
              전국 인물이라 지역 AI 소개 대신 위키백과 요약을 제공합니다. 출처:{" "}
              <a href={wiki.url} target="_blank" rel="noopener noreferrer" className="underline">위키백과</a>
            </p>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-foreground-muted">
            전국 단위 인물이라 지역 아카이브 기반 AI 소개는 제공하지 않습니다. 아래 집계·관계망과 ‘나온 기사’ 원문을 참고하세요.
          </p>
        )
      ) : brief === undefined ? (
        <div className="space-y-1.5" aria-hidden>
          <div className="h-3 w-11/12 animate-pulse rounded bg-brand/10" />
          <div className="h-3 w-full animate-pulse rounded bg-brand/10" />
          <div className="h-3 w-10/12 animate-pulse rounded bg-brand/10" />
          <p className="pt-1 text-[0.6875rem] text-foreground-muted">기사에서 인물 소개를 작성하는 중…</p>
        </div>
      ) : brief ? (
        <div className="space-y-2.5 text-sm leading-relaxed text-foreground">
          {briefParagraphs(brief).map((p, i) => (
            <p key={i} className={i === 0 ? "font-medium" : undefined}>{p}</p>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-foreground">
          <strong className="text-brand">{prof.person.name}</strong> — {desc ? `${desc} · ` : ""}아카이브 기사 <strong>{prof.person.mentions.toLocaleString()}건</strong>에 등장{years ? ` (${years})` : ""}.
          {topCo.length ? <> 기사에서 <strong>{topCo.join(" · ")}</strong> 등과 자주 함께 다뤄졌습니다.</> : null}
        </p>
      )}
      {/* 확정 팩트 스트립 — AI 요약과 별개의 집계 수치(항상 표시) */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-brand/10 pt-2.5 text-[0.6875rem] text-foreground-muted">
        <span>아카이브 <strong className="text-foreground">{prof.person.mentions.toLocaleString()}건</strong></span>
        {years && <span>활동 <strong className="text-foreground">{years}</strong></span>}
        {desc && <span>직위 <strong className="text-foreground">{desc}</strong></span>}
        {latestArt && <span>최신 기사 <strong className="text-foreground">{latestArt}</strong>{staleMonths >= 2 ? <span className="text-amber-600"> · 최근 소식 없음</span> : null}</span>}
        {topCo.length > 0 && <span>자주 동반 <strong className="text-foreground">{topCo.join(" · ")}</strong></span>}
      </div>
      {topics.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[0.6875rem] text-foreground-muted">주요 주제</span>
          {topics.map((t) => <span key={t} className="rounded-full bg-brand/10 px-2 py-0.5 text-[0.6875rem] text-brand">{t}</span>)}
        </div>
      )}
      {!suppressed && <p className="mt-2 text-[0.6875rem] text-foreground-muted">※ AI가 기사 제목·본문에서 자동 작성(미검증). 정확한 내용은 아래 ‘나온 기사’ 원문을 확인하세요.</p>}
    </section>
  );
}

// ── 관계망(중심 인물 강조 + 검수된 관계만 색 라벨) ─────────────
const REL_LEGEND: Record<string, string> = {
  "협력·동료": "#16a34a",
  "대립·갈등": "#dc2626",
  "전임·후임": "#7c3aed",
  "소속·상하": "#2563eb",
  "가족·인척": "#d97706",
};
// 미검수(AI 추정)라도 그래프에 노출을 허용하는 '저위험' 관계 유형. 민감한 대립·갈등·가족·인척은 검수된 것만.
const SAFE_UNVERIFIED = new Set(["협력·동료", "전임·후임", "소속·상하"]);
function RelationGraph({ prof, onOpen, onShuffle }: { prof: PersonProfile; onOpen: (id: string) => void; onShuffle?: () => void }) {
  const centerId = prof.graph.center?.id;
  // 중심↔이웃: coappear가 verified를 담고 있어 정책 정확 적용 — 검수(전 유형)=실선, 미검수라도 안전 유형=점선(AI 추정).
  const centerRel = new Map(
    prof.coappear
      .filter((c) => c.reltype && (c.verified === 1 || SAFE_UNVERIFIED.has(c.reltype)))
      .map((c) => [c.id, { reltype: c.reltype as string, estimated: c.verified !== 1 }] as const),
  );
  const edges = prof.graph.edges.map((e) => {
    const other = e.a === centerId ? e.b : e.b === centerId ? e.a : null;
    if (other) { const r = centerRel.get(other); return { ...e, reltype: r?.reltype, estimated: r?.estimated }; }
    // 이웃끼리(mesh)는 verified 미상 → 안전 유형만 'AI 추정'(점선)으로. 민감·기타는 숨김.
    const rel = e.reltype && SAFE_UNVERIFIED.has(e.reltype) ? e.reltype : undefined;
    return { ...e, reltype: rel, estimated: rel ? true : undefined };
  });
  const usedRels = [...new Set(edges.map((e) => e.reltype).filter(Boolean) as string[])];
  const hasEstimated = edges.some((e) => e.reltype && e.estimated);
  const hasVerified = edges.some((e) => e.reltype && !e.estimated);
  return (
    <section className="rounded-lg border border-brand/15 bg-background p-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-1">
        <p className="text-xs text-foreground-muted">관계망 — 가운데가 이 인물, 주변은 함께 등장한 사람(<strong>원·이름 클릭 시 그 사람으로 이동</strong>). 바이라인 제외.</p>
        {/* 처음 들어온 사람이 '다음 것'을 볼 수 있게 — 검색어를 떠올리지 못해도 계속 둘러볼 수 있다. */}
        {onShuffle && (
          <button type="button" onClick={onShuffle}
            className="shrink-0 rounded-full border border-brand/25 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/5">
            🔀 다른 인물 보기
          </button>
        )}
      </div>
      <KgGraph nodes={prof.graph.nodes} edges={edges} centerId={centerId} onNodeClick={onOpen} height={640} />
      {usedRels.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-1 pt-1 text-[0.6875rem]">
          {usedRels.map((r) => (
            <span key={r} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: REL_LEGEND[r] ?? "#888" }} />
              {r}
            </span>
          ))}
          <span className="text-foreground-muted">
            — {hasVerified && "실선=검수됨"}{hasVerified && hasEstimated && " · "}{hasEstimated && "점선=AI 추정(미검수)"} · 민감 관계(대립·갈등·가족·인척)는 검수된 것만
          </span>
        </div>
      )}
    </section>
  );
}

