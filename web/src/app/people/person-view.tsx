"use client";

// 인물 상세 화면 — 검색 결과에서도, 개별 주소(/people/<id>)에서도 같은 것을 보여준다.
//
//   왜 갈라냈나: 예전엔 이 화면이 /people 안의 상태로만 있었다. 그래서
//     ① 인물 하나를 **주소로 가리킬 수 없었고**(공유 불가·뒤로가기 불가)
//     ② 검색엔진이 인물 3만 4천 명을 한 쪽도 색인할 수 없었다.
//   사람 이름 검색은 지역 언론의 가장 큰 유입 통로라, 이게 통째로 비어 있었다.

import { useState, useEffect } from "react";
import { formatTermRange } from "@/lib/term-date";
import Link from "next/link";

import KgGraph from "@/components/kg-graph";
import { Pill } from "@/components/editorial";
import { getPersonBriefPublic, type WikiSummary } from "@/lib/api/kg-public";
import { API_BASE_URL } from "@/lib/api/client";
import type { PersonProfile } from "@/lib/api/kg";

// 2026-10 리디자인(가독성) — 지금 태안·홈과 같은 체계(ti 토큰·세리프 제목·0.85rem 아래 글자 없음).
//   흐름: 이름 머리(사진·핵심 숫자) → 인물 소개 → 이력(출마·직위·소속) → 관계망 → 기사로 본 활동.
//   제목 단계는 쓰는 곳에 따라 다르다 — 개별 주소에선 이름이 h1, /people 맛보기에선 h2(쪽 제목이 따로 있다).

type Lv = 1 | 2;
const tag = (n: number) => `h${Math.min(n, 6)}` as "h2";

/** 큰 묶음 머리 — editorial SecHead와 같은 모양이되 제목 단계를 바꿀 수 있다. */
function GroupHead({ id, level, title, note }: { id: string; level: number; title: string; note?: React.ReactNode }) {
  const H = tag(level);
  return (
    <div className="mb-5 border-t-2 border-ti-ink pt-3.5">
      <H id={id} className="font-head text-[clamp(1.4rem,2.6vw,1.85rem)] font-black tracking-[-0.02em] text-ti-ink">{title}</H>
      {note && <p className="mt-1 text-ti-ink2">{note}</p>}
    </div>
  );
}
/** 카드 — 제목 단계를 받아 같은 모양으로. */
function Box({ id, level, title, aside, className = "", children }: {
  id: string; level: number; title: React.ReactNode; aside?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  const H = tag(level);
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-[18px] border border-ti-line bg-ti-surface p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <H id={id} className="text-[1.15rem] font-bold text-ti-ink">{title}</H>
        {aside}
      </div>
      {children}
    </section>
  );
}
const Note = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-[0.9rem] leading-relaxed text-ti-ink2 ${className}`}>{children}</p>
);

export function PersonProfileView({ prof, onOpen, onShuffle, onBack, headingLevel = 2, summary }: {
  prof: PersonProfile;
  onOpen: (id: string) => void;
  /** 없으면 '다른 인물 보기' 단추를 숨긴다(개별 주소 화면에는 뜻이 없다). */
  onShuffle?: () => void;
  /** 검색 결과 안에서 열렸을 때만 — 없으면 목록으로 가는 링크를 보여준다. */
  onBack?: () => void;
  /** 이름 제목 단계 — 개별 주소는 1(쪽의 유일한 h1), /people 안에선 2. */
  headingLevel?: Lv;
  /** 검색엔진이 읽는 한 줄 — 이름 바로 밑에 둔다(사람에게도 '누구인지'를 먼저 알려준다). */
  summary?: string;
}) {
  if (!prof.person) return null;
  const L = headingLevel, G = L + 1, C = L + 2;
  const Name = tag(L);
  const pid = prof.person.id.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
  const nameId = `pv-name-${pid}`;
  const hasCareer = (prof.nec && prof.nec.total > 0) || prof.offices.length > 0 || !!prof.affiliations?.length;
  const backCls = "inline-flex min-h-11 shrink-0 items-center rounded-full border border-ti-line bg-ti-surface px-4 font-semibold text-ti-petrol-ink hover:border-ti-petrol";
  return (
      <article aria-labelledby={nameId} className="space-y-10 text-ti-ink">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ti-ink pb-5 pt-2">
          <div className="flex min-w-0 items-start gap-4">
            {prof.photo && (
              // 역대 군수·현직 군의원 공식 사진(R2). 로드 실패 시 조용히 숨김.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={prof.photo.startsWith("http") ? prof.photo : `${API_BASE_URL}${prof.photo}`} alt={`${prof.person.name} 공식 사진`}
                className="h-20 w-20 shrink-0 rounded-full border border-ti-line object-cover md:h-24 md:w-24"
                loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <div className="min-w-0">
              <p className="text-[0.85rem] font-bold tracking-[0.14em] text-ti-petrol-ink">인물 · 태안신문 아카이브</p>
              <Name id={nameId} className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 font-head text-[clamp(1.9rem,4vw,2.7rem)] font-black leading-tight tracking-[-0.025em] text-ti-ink">
                {prof.person.name}
                {prof.nec?.hanja && <span className="font-sans text-[1.15rem] font-normal text-ti-ink2">{prof.nec.hanja}</span>}
                {prof.nec?.birthYear && <span className="font-sans text-[1rem] font-normal text-ti-ink2">({prof.nec.birthYear}년생)</span>}
              </Name>
              {prof.person.qualifier && (
                // 이름만으로는 누구인지 알 수 없는 갈래(동명이인 분리) — 이름 옆에 바로 붙인다.
                <p className="mt-2"><Pill tone="plain">{prof.person.qualifier}</Pill></p>
              )}
              {summary && <p className="mt-2 max-w-[40em] text-[1.05rem] text-ti-ink2">{summary}</p>}
              {/* 핵심 숫자 — 크게, 단위는 옆에 */}
              <dl className="m-0 mt-3 flex flex-wrap gap-x-6 gap-y-2">
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-ti-ink2">아카이브 등장</dt>
                  <dd className="m-0"><span className="font-display text-[1.6rem] font-semibold tabular-nums">{prof.person.mentions.toLocaleString()}</span><span className="ml-0.5 text-ti-ink2">건</span></dd>
                </div>
                {prof.nec && prof.nec.total > 0 && (
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-ti-ink2">출마</dt>
                    <dd className="m-0"><span className="font-display text-[1.6rem] font-semibold tabular-nums">{prof.nec.total}</span><span className="ml-0.5 text-ti-ink2">회</span></dd>
                  </div>
                )}
                {prof.nec && prof.nec.wins > 0 && (
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-ti-ink2">당선</dt>
                    <dd className="m-0"><span className="font-display text-[1.6rem] font-semibold tabular-nums">{prof.nec.wins}</span><span className="ml-0.5 text-ti-ink2">회</span></dd>
                  </div>
                )}
                {prof.nec?.span && (
                  <div className="flex items-baseline gap-1.5">
                    <dt className="text-ti-ink2">활동</dt>
                    <dd className="m-0 font-semibold tabular-nums">{prof.nec.span}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
          {onBack
            ? <button type="button" onClick={onBack} className={backCls}>검색으로 돌아가기</button>
            : <Link href="/people" className={backCls}>인물 탐색으로</Link>}
        </header>

        <section aria-labelledby={`${nameId}-intro`}>
          <GroupHead id={`${nameId}-intro`} level={G} title="인물 소개" />
          <div className={`grid items-start gap-5 ${prof.sameName?.length ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : ""}`}>
            <PersonIntro prof={prof} level={C} />
            <SameNameCard prof={prof} onOpen={onOpen} level={C} />
          </div>
        </section>

        {hasCareer && (
          <section aria-labelledby={`${nameId}-career`}>
            <GroupHead id={`${nameId}-career`} level={G} title="이력" note="출마 이력은 선관위 자료, 직위는 검증된 자료, 소속은 기사에서 센 자료입니다." />
            <div className="space-y-5">
              {prof.nec && prof.nec.total > 0 && <CandidacyTable nec={prof.nec} level={C} />}
              <div className="grid items-start gap-5 md:grid-cols-2">
                {prof.offices.length > 0 && (
                  <Box id={`${nameId}-office`} level={C} title="직위·소속" aside={<Pill tone="good">검증됨</Pill>}>
                    <ul className="m-0 list-none space-y-2 p-0">
                      {prof.offices.map((o, i) => (
                        <li key={i} className="border-l-4 border-ti-petrol pl-3">
                          <span className="font-semibold">{o.office}{o.ordinal ? ` (${o.ordinal}대)` : ""}</span>
                          {formatTermRange(o.start, o.end) && <span className="block text-[0.95rem] tabular-nums text-ti-ink2">{formatTermRange(o.start, o.end)}</span>}
                        </li>
                      ))}
                    </ul>
                  </Box>
                )}

                {!!prof.affiliations?.length && (
                  <Box id={`${nameId}-aff`} level={C} title="소속">
                    {/* ⚠ 예전엔 '(검증됨)'이라고만 적어, 기사 한 줄에서 잘못 뽑힌 직함까지 확정 사실로 읽혔다
                         (김영인 군의원에게 '태안군청 군수'가 붙었다). 무엇을 근거로 한 줄인지 줄마다 밝힌다. */}
                    <Note className="mb-3">
                      ‘기사 N건’은 그 직함으로 나온 <strong>기사 수</strong>, 연도는 <strong>기사에 나온 해</strong>입니다.
                      재임 기간은 ‘직위·소속’을, 정당은 ‘출마 이력’을 보세요.
                    </Note>
                    <ul className="m-0 list-none divide-y divide-ti-line p-0">
                      {prof.affiliations.map((a) => (
                        <li key={a.orgId} className="py-2">
                          <span className="font-semibold">{a.org}</span>
                          {a.role && <span className="text-ti-ink2"> {a.role}</span>}
                          {/* 기사에서 뽑은 연도는 **재임 기간이 아니라 기사에 나온 해**다.
                               그냥 '2006~2025'로 찍었더니 19년 재임처럼 읽혔다(한상기 실제 재임 2014~2018). */}
                          <span className="block text-[0.95rem] tabular-nums text-ti-ink2">
                            {a.fromArticles
                              ? <>{"기사 "}{(a.count ?? 0).toLocaleString()}건{a.years && <>{" · 기사에 나온 해 "}{a.years}</>}</>
                              : <>{"선관위 자료"}{a.years && <>{" · "}{a.years}</>}</>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Box>
                )}
              </div>
            </div>
          </section>
        )}

        {(prof.graph.nodes.length > 0 || prof.coappear.length > 0) && (
          <section aria-labelledby={`${nameId}-graph`}>
            <GroupHead id={`${nameId}-graph`} level={G} title="관계망" note="같은 기사에 이름이 함께 나온 사람과 기관입니다. 친분·소속 관계를 뜻하지 않습니다." />
            <div className="space-y-5">
              {prof.graph.nodes.length > 0 && <RelationGraph prof={prof} onOpen={onOpen} onShuffle={onShuffle} level={C} idBase={nameId} />}

              {prof.coappear.length > 0 && (
                <Box id={`${nameId}-co`} level={C} title="같은 기사에 함께 나온 인물">
                  <Note className="mb-3">숫자는 <strong>같은 기사에 이름이 함께 나온 기사 수</strong>입니다. 친분·소속 관계를 뜻하지 않습니다. 관계 이름표는 검수된 것만 붙입니다.</Note>
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {prof.coappear.map((c) => (
                      <li key={c.id}>
                        {/* 예전엔 정의되지 않은 open(=window.open)을 불러 새 창이 떴다 — 그림과 같이 onOpen으로 옮겨 간다. */}
                        <button type="button" onClick={() => onOpen(c.id)}
                          className="inline-flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-ti-line bg-ti-surface px-4 py-1.5 text-left hover:border-ti-petrol hover:bg-ti-sunk">
                          <span className="font-semibold text-ti-ink">{c.name}</span>
                          <span className="text-[0.95rem] text-ti-ink2">함께 <span className="font-display font-semibold tabular-nums text-ti-ink">{c.count}</span>건</span>
                          {c.verified === 1 && c.reltype ? <Pill tone="good">{c.reltype}</Pill> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Box>
              )}
            </div>
          </section>
        )}

        {(prof.timeline.length > 0 || prof.articles.length > 0) && (
          <section aria-labelledby={`${nameId}-arts`}>
            <GroupHead id={`${nameId}-arts`} level={G} title="기사로 본 활동" />
            <div className={`grid items-start gap-5 ${prof.timeline.length > 0 && prof.articles.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" : ""}`}>
              {prof.timeline.length > 0 && <Timeline timeline={prof.timeline} level={C} id={`${nameId}-tl`} />}

              {prof.articles.length > 0 && (
                <Box id={`${nameId}-list`} level={C} title={<>나온 기사 <span className="font-normal text-ti-ink2">(최신 {prof.articles.length}건)</span></>}>
                  <ul className="m-0 list-none divide-y divide-ti-line p-0">
                    {prof.articles.map((a) => (
                      <li key={a.idxno}>
                        <Link href={`/news/${a.idxno}`} className="group flex min-h-11 flex-col gap-0.5 py-2.5">
                          <span className="text-[0.9rem] tabular-nums text-ti-ink2">{a.published_at?.slice(0, 10).replace(/-/g, ". ")}</span>
                          <span className="font-semibold text-ti-ink group-hover:text-ti-petrol-ink group-hover:underline group-hover:underline-offset-4">{a.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Box>
              )}
            </div>
          </section>
        )}
      </article>
  );
}

/** 시기별 등장 — 막대는 눈으로, 같은 숫자는 목록으로(화면낭독기). 해마다 이름표를 달면 휴대폰에서 겹친다. */
function Timeline({ timeline, level, id }: { timeline: PersonProfile["timeline"]; level: number; id: string }) {
  const max = Math.max(...timeline.map((t) => t.count), 1);
  const peak = timeline.reduce((m, t) => (t.count > m.count ? t : m), timeline[0]);
  const first = timeline[0], last = timeline[timeline.length - 1];
  return (
    <Box id={id} level={level} title="해마다 나온 기사 수">
      <p className="text-ti-ink2">
        가장 많이 나온 해 <b className="text-ti-ink">{peak.year}년</b>{" "}
        <span className="font-display text-[1.4rem] font-semibold tabular-nums text-ti-ink">{peak.count.toLocaleString()}</span>건
      </p>
      <div aria-hidden className="mt-3 flex items-end gap-1 border-b border-ti-line" style={{ height: 120 }}>
        {timeline.map((t) => (
          <div key={t.year} className="flex flex-1 items-end self-stretch" title={`${t.year}년 ${t.count}건`}>
            <div className={`w-full rounded-t ${t.year === peak.year ? "bg-ti-navy" : "bg-ti-petrol"}`} style={{ height: `${Math.max(2, Math.round((t.count / max) * 112))}px` }} />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1.5 flex justify-between text-[0.9rem] tabular-nums text-ti-ink2">
        <span>{first.year}년</span>
        {last.year !== first.year && <span>{last.year}년</span>}
      </div>
      <details className="mt-3">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ti-petrol-ink">해마다 숫자로 보기</summary>
        <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 p-0 pt-2 tabular-nums md:grid-cols-3">
          {timeline.map((t) => <li key={t.year}>{t.year}년 <b>{t.count.toLocaleString()}</b>건</li>)}
        </ul>
      </details>
    </Box>
  );
}

// ── 같은 이름의 다른 인물 ───────────────────────────────────────
// 지역지에서 동명이인은 흔하다. 소원면 주민자치위원장 '박정희'와 전 대통령이 한 사람으로 묶여
//   전직 대통령 얼굴이 지역 인물에게 걸렸던 사고에서 나왔다(2026-08-27).
//   본문은 **지역 인물**이 주인공이고, 겹치는 다른 사람은 얼굴·한 줄 소개로 여기서 갈라 준다.
function SameNameCard({ prof, onOpen, level }: { prof: PersonProfile; onOpen?: (id: string) => void; level: number }) {
  const alts = prof.sameName ?? [];
  if (!alts.length) return null;
  return (
    <Box id={`same-name-${prof.person?.id ?? ""}`.replace(/[^a-zA-Z0-9가-힣_-]/g, "_")} level={level} title="같은 이름의 다른 인물" className="bg-ti-sunk">
      <ul className="m-0 list-none space-y-2 p-0">
        {alts.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => onOpen?.(a.id)}
              className="flex min-h-11 w-full items-center gap-3 rounded-[14px] border border-ti-line bg-ti-surface p-3 text-left hover:border-ti-petrol">
              {a.photo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={a.photo} alt="" className="h-12 w-12 shrink-0 rounded-full border border-ti-line object-cover"
                    loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                : <span aria-hidden className="h-12 w-12 shrink-0 rounded-full border border-ti-line bg-ti-sunk" />}
              <span className="min-w-0">
                <span className="block">
                  <strong className="text-ti-ink">{a.name}</strong>
                  <span className="ml-1.5 text-ti-ink2">— {a.qualifier ?? "지역 인물"}</span>
                </span>
                {a.extract && <span className="mt-0.5 line-clamp-2 block text-[0.95rem] text-ti-ink2">{a.extract}</span>}
                <span className="mt-1 block text-[0.95rem] font-semibold text-ti-petrol-ink">기사 {a.mentions.toLocaleString()}건 보기</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Note className="mt-3">
        이름이 같을 뿐 <strong>다른 사람</strong>입니다. 기사 본문의 쓰임으로 갈랐으며, 애매한 기사는 지역 인물 쪽에 남겨 둡니다.
      </Note>
    </Box>
  );
}

// ── 인물 소개(기사 근거 AI 전기 + 확정 팩트 스트립) ─────────────
const TOPIC_NOISE = new Set(["개최", "대상", "성황", "성료", "실시", "위한", "한다", "선정", "진행"]);
// 한 덩어리 소개글을 읽기 좋게 문단 분할 — 첫 문장은 리드(누구인가), 이후는 2문장씩 묶어 문단으로.
/**
 * 출마 이력 — 선거일·선거구·정당·직업·결과. 선관위 후보자·당선인 자료가 근거다.
 *   ⚠ 결과를 모르는 회차는 **빈 칸이 아니라 '모름'** 으로 적는다. 빈 칸은 낙선처럼 보인다.
 */
function CandidacyTable({ nec, level }: { nec: NonNullable<PersonProfile["nec"]>; level: number }) {
  // 표 대신 회차마다 카드 한 장 — 6칸 표는 휴대폰에서 옆으로 밀어야 했다. 결과는 색이 아니라 글자 알약.
  return (
    <Box id="nec-runs" level={level} title="출마 이력" aside={<span className="text-[0.95rem] text-ti-ink2">중앙선거관리위원회</span>}>
      <Note className="mb-3">후보자 본인이 신고하고 선관위가 공고한 자료입니다.</Note>
      <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 lg:grid-cols-3">
        {nec.runs.map((r) => (
          <li key={`${r.sgId}${r.kind}`} className="rounded-[14px] border border-ti-line bg-ti-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-ti-ink">{r.kind}</p>
              {r.result === "당선" ? (
                <Pill tone="good">당선</Pill>
              ) : r.result === "낙선" ? (
                <Pill tone="plain">낙선</Pill>
              ) : (
                <span title="당선자 자료를 받지 못한 회차입니다"><Pill tone="plain">결과 모름</Pill></span>
              )}
            </div>
            <dl className="m-0 mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.98rem]">
              <dt className="text-ti-ink2">선거일</dt>
              <dd className="m-0 tabular-nums">
                {r.date}
                {r.assumed && <span className="ml-1.5 text-ti-ink2">(이름으로 맞춘 추정 기록)</span>}
              </dd>
              <dt className="text-ti-ink2">선거구</dt><dd className="m-0">{r.district || "—"}</dd>
              <dt className="text-ti-ink2">정당</dt><dd className="m-0">{r.party || "—"}</dd>
              {r.job && <><dt className="text-ti-ink2">직업</dt><dd className="m-0">{r.job}</dd></>}
            </dl>
          </li>
        ))}
      </ol>

      {!!nec.careers?.length && (
        <div className="mt-4 border-t border-ti-line pt-4">
          <p className="mb-1.5 font-bold text-ti-ink">신고 경력</p>
          <ul className="m-0 list-disc space-y-1 pl-5 text-ti-ink2">
            {nec.careers.map((c, i) => (
              <li key={i}>{c.tense ? `(${c.tense}) ` : ""}{c.text}</li>
            ))}
          </ul>
        </div>
      )}
    </Box>
  );
}

function briefParagraphs(text: string): string[] {
  const s = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  if (s.length <= 2) return s;
  const paras = [s[0]];
  for (let i = 1; i < s.length; i += 2) paras.push(s.slice(i, i + 2).join(" "));
  return paras;
}
function PersonIntro({ prof, level }: { prof: PersonProfile; level: number }) {
  const pid = prof.graph.center?.id;
  const [brief, setBrief] = useState<string | null | undefined>(undefined); // undefined=로딩, null=근거부족
  const [suppressed, setSuppressed] = useState(false); // 전국 인물 등 AI 소개 억제
  // AI 소개를 통째로 끈 상태(app_settings.public_person_bio=off). 생성문만 빠지고
  //   집계 한 문장·팩트 스트립·관계망은 그대로 남는다 — 세어 보여주는 것은 반박이 곧 확인이다.
  const [bioOff, setBioOff] = useState(false);
  const [wiki, setWiki] = useState<WikiSummary | null>(null); // 억제 시 위키백과 요약 대체
  const [byline, setByline] = useState(false); // 초허브(기자·편집인) — 소개 억제
  useEffect(() => {
    let alive = true;
    setBrief(undefined); setSuppressed(false); setWiki(null); setByline(false);
    if (!pid) { setBrief(null); return; }
    getPersonBriefPublic(pid).then((r) => { if (alive) { setBrief(r.brief); setSuppressed(!!r.suppressed); setWiki(r.wiki ?? null); setByline(!!r.byline); setBioOff(!!r.bioOff); } }).catch(() => { if (alive) setBrief(null); });
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

  const badge = suppressed
    ? (wiki ? "위키백과 요약" : null)
    : bioOff ? "기사 집계" : "AI 요약 · 기사 근거";
  const fact = "text-ti-ink2";
  return (
    <Box id={`intro-${pid ?? "x"}`.replace(/[^a-zA-Z0-9가-힣_-]/g, "_")} level={level} title="이 사람은" aside={badge ? <Pill tone="plain">{badge}</Pill> : undefined}>
      {/* AI 전기 — 지연 로드. 전국 인물 등 억제 대상은 로컬 AI 소개 대신 위키백과 요약(있으면)·안내. 팩트·관계망은 유지. */}
      {suppressed ? (
        byline ? (
          <p className="leading-relaxed text-ti-ink2">
            이 인물은 기사 작성자(기자·편집인)로 보여 인물 소개를 제공하지 않습니다. ‘아카이브 등장’ 수는 대체로 이 사람이 <strong>쓴 기사</strong> 수입니다.
          </p>
        ) : wiki ? (
          <div className="space-y-2">
            <p className="text-[1.05rem] leading-relaxed text-ti-ink">{wiki.extract}</p>
            <Note>
              전국 인물이라 지역 AI 소개 대신 위키백과 요약을 제공합니다. 출처:{" "}
              <a href={wiki.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ti-petrol-ink underline underline-offset-4">위키백과<span className="sr-only">(새 창)</span></a>
            </Note>
          </div>
        ) : (
          <p className="leading-relaxed text-ti-ink2">
            전국 단위 인물이라 지역 아카이브 기반 AI 소개는 제공하지 않습니다. 아래 집계·관계망과 ‘나온 기사’ 원문을 참고하세요.
          </p>
        )
      ) : brief === undefined ? (
        <div className="space-y-2">
          <div aria-hidden className="h-4 w-11/12 animate-pulse rounded bg-ti-sunk motion-reduce:animate-none" />
          <div aria-hidden className="h-4 w-full animate-pulse rounded bg-ti-sunk motion-reduce:animate-none" />
          <div aria-hidden className="h-4 w-10/12 animate-pulse rounded bg-ti-sunk motion-reduce:animate-none" />
          <p role="status" className="pt-1 text-[0.95rem] text-ti-ink2">기사에서 인물 소개를 작성하는 중…</p>
        </div>
      ) : brief ? (
        <div className="space-y-3 text-[1.05rem] leading-relaxed text-ti-ink">
          {briefParagraphs(brief).map((p, i) => (
            <p key={i} className={i === 0 ? "font-semibold" : undefined}>{p}</p>
          ))}
        </div>
      ) : (
        <p className="text-[1.05rem] leading-relaxed text-ti-ink">
          <strong>{prof.person.name}</strong> — {desc ? `${desc} · ` : ""}아카이브 기사 <strong>{prof.person.mentions.toLocaleString()}건</strong>에 등장{years ? ` (${years})` : ""}.
          {topCo.length ? <> 기사에서 <strong>{topCo.join(" · ")}</strong> 등과 자주 함께 다뤄졌습니다.</> : null}
        </p>
      )}
      {/* 확정 팩트 스트립 — AI 요약과 별개의 집계 수치(항상 표시) */}
      <dl className="m-0 mt-4 grid gap-x-6 gap-y-2 border-t border-ti-line pt-3 md:grid-cols-2">
        <div className="flex flex-wrap items-baseline gap-x-2"><dt className={fact}>아카이브</dt><dd className="m-0 font-semibold tabular-nums">{prof.person.mentions.toLocaleString()}건</dd></div>
        {years && <div className="flex flex-wrap items-baseline gap-x-2"><dt className={fact}>활동</dt><dd className="m-0 font-semibold tabular-nums">{years}</dd></div>}
        {desc && <div className="flex flex-wrap items-baseline gap-x-2"><dt className={fact}>직위</dt><dd className="m-0 font-semibold">{desc}</dd></div>}
        {latestArt && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <dt className={fact}>최신 기사</dt>
            <dd className="m-0 flex flex-wrap items-center gap-2 font-semibold tabular-nums">{latestArt}{staleMonths >= 2 ? <Pill tone="warn">최근 소식 없음</Pill> : null}</dd>
          </div>
        )}
        {topCo.length > 0 && <div className="flex flex-wrap items-baseline gap-x-2 md:col-span-2"><dt className={fact}>자주 함께 나온 사람</dt><dd className="m-0 font-semibold">{topCo.join(" · ")}</dd></div>}
      </dl>
      {topics.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-ti-ink2">주요 주제</span>
          {topics.map((t) => <Pill key={t} tone="plain">{t}</Pill>)}
        </div>
      )}
      {!suppressed && !bioOff && <Note className="mt-3">※ AI가 기사 제목·본문에서 자동 작성(미검증). 정확한 내용은 아래 ‘나온 기사’ 원문을 확인하세요.</Note>}
      {bioOff && <Note className="mt-3">※ 위 내용은 아카이브 기사를 <strong>센 값</strong>입니다. 인물평·이력 서술은 제공하지 않습니다 — 아래 ‘나온 기사’ 원문을 확인하세요.</Note>}
    </Box>
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
function RelationGraph({ prof, onOpen, onShuffle, level, idBase }: { prof: PersonProfile; onOpen: (id: string) => void; onShuffle?: () => void; level: number; idBase: string }) {
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
    <Box id={`${idBase}-net`} level={level} title="관계망 그림"
      aside={onShuffle && (
        // 처음 들어온 사람이 '다음 것'을 볼 수 있게 — 검색어를 떠올리지 못해도 계속 둘러볼 수 있다.
        <button type="button" onClick={onShuffle} className="btn-ghost px-5">다른 인물 보기</button>
      )}>
      <Note className="mb-3">
        가운데가 이 인물, 주변은 <strong>같은 기사에 함께 나온 사람</strong>입니다 — 친분·소속 관계가 아니라 <strong>기사에 이름이 함께 나온 횟수</strong>로 이었습니다.
        원이나 이름을 누르면 그 사람으로 갑니다. 끌어서 옮길 수 있고, 그림 아래 ‘목록으로 보기’에서 같은 내용을 글로 볼 수 있습니다. 바이라인 제외.
      </Note>
      <div className="-mx-3 md:mx-0">
        <KgGraph nodes={prof.graph.nodes} edges={edges} centerId={centerId} onNodeClick={onOpen} height={640} />
      </div>
      {usedRels.length > 0 && (
        <div className="mt-3 border-t border-ti-line pt-3">
          <p className="sr-only">관계선 범례:</p>
          <ul className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1.5 p-0 text-[0.95rem] text-ti-ink">
            {usedRels.map((r) => (
              <li key={r} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-1 w-6 rounded-sm" style={{ background: REL_LEGEND[r] ?? "#888" }} />
                {r}
              </li>
            ))}
          </ul>
          <Note className="mt-1.5">
            {hasVerified && "실선 = 검수됨"}{hasVerified && hasEstimated && " · "}{hasEstimated && "점선 = AI 추정(미검수)"} · 민감 관계(대립·갈등·가족·인척)는 검수된 것만 표시
          </Note>
        </div>
      )}
    </Box>
  );
}
