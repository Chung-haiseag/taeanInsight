"use client";

// 낭독 따라읽기 — 재생 위치에 맞춰 기사 본문의 해당 단어를 하이라이트한다(당진시대 방식).
//
//   원리: 서버가 낭독 음성을 Whisper로 되받아 만든 '단어별 시각 + 원문 글자 위치'를 쓴다
//   (/api/audio/news/:id/words). 정렬 기준 원문은 `제목.\n본문(공백 정규화)`이라, 화면에
//   렌더된 문단과 글자 위치가 그대로는 안 맞는다.
//
//   맞추는 법: **공백을 뺀 글자 순번(non-space index)** 으로 환산한다. 공백 정규화는 공백만
//   건드리므로 두 텍스트의 '공백 아닌 글자 나열'은 완전히 동일하다 — 이 순번은 항상 일치한다.

import { useEffect, useMemo, useRef, useState } from "react";

// ns = 원문에서 공백을 제외한 글자 순번, len = 그 단어의 글자 수(서버 align.ts가 계산해 보낸다).
export interface WordTime { w: string; s: number; e: number; ns?: number; len?: number }
interface WordsDoc { idxno: number; duration: number; words: WordTime[] }

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

/** 문자열에서 공백 아닌 글자 수(= non-space 순번 계산용). */
const nsCount = (s: string) => s.replace(/\s/g, "").length;

/** 낭독 자막 로드. 없으면 null(하이라이트 없이 재생만 — 조용히 비활성). */
export function useReadAlong(idxno: number, enabled: boolean) {
  const [doc, setDoc] = useState<WordsDoc | null>(null);
  useEffect(() => {
    if (!enabled || !idxno) return;
    let alive = true;
    fetch(`${API}/api/audio/news/${idxno}/words`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.words?.length) setDoc(d as WordsDoc); })
      .catch(() => { /* 자막은 부가기능 — 실패해도 재생엔 영향 없음 */ });
    return () => { alive = false; };
  }, [idxno, enabled]);
  return doc;
}

/**
 * 원문을 **문장 경계**로 나눈다(공백 제외 순번 기준).
 *   낭독 정렬 원문이 `제목.\n본문`이라 제목도 하나의 문장이 된다.
 */
export function sentenceRanges(source: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let ns = 0, start = 0;
  for (const ch of source) {
    if (!/\s/.test(ch)) ns++;
    // 한국어 기사 문장 끝: 마침표·물음표·느낌표·줄바꿈. 닫는 따옴표는 앞 문장에 붙여 둔다.
    if (ch === "\n" || /[.?!]/.test(ch)) {
      if (ns > start) { out.push({ start, end: ns }); start = ns; }
    }
  }
  if (ns > start) out.push({ start, end: ns });
  return out;
}

/**
 * 재생 시각 → 하이라이트할 구간(**문장 단위**).
 *   단어 단위는 글자가 계속 깜빡여 눈이 피로하고, 고령 독자가 따라가기 어렵다.
 *   그래서 '지금 읽는 단어가 속한 문장' 전체를 은은하게 칠한다 — 시선이 문장에 머문다.
 *
 *   ※예전엔 서버가 at(원문 글자 인덱스)을 보내 프런트가 매번 환산했는데, 서버가 ns로 바뀐 뒤
 *     프런트가 at을 계속 읽어 **모든 단어가 걸러지고 하이라이트가 통째로 죽었다**(2026-08-19).
 */
export function useActiveRange(doc: WordsDoc | null, source: string, pos: number) {
  const marks = useMemo(() => {
    if (!doc) return [] as Array<{ s: number; e: number; ns: number; len: number }>;
    return doc.words
      .filter((w) => typeof w.ns === "number")
      .map((w) => ({ s: w.s, e: w.e, ns: w.ns!, len: w.len ?? nsCount(w.w) }));
  }, [doc]);

  const sentences = useMemo(() => sentenceRanges(source), [source]);

  return useMemo(() => {
    if (!marks.length) return null;
    // 현재 시각이 속한 단어(없으면 직전 단어) — 이분 탐색.
    let lo = 0, hi = marks.length - 1, hit = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (marks[m].s <= pos) { hit = m; lo = m + 1; } else hi = m - 1;
    }
    if (hit < 0) return null;
    const cur = marks[hit];
    // 마지막 단어가 끝난 뒤로 한참 지났으면 해제(정지·종료 후 잔상 방지).
    if (pos > cur.e + 2) return null;
    // 그 단어를 품은 문장으로 확장. 못 찾으면(경계 어긋남) 단어 구간으로 폴백.
    const sen = sentences.find((r) => cur.ns >= r.start && cur.ns < r.end);
    return sen ?? { start: cur.ns, end: cur.ns + cur.len };
  }, [marks, sentences, pos]);
}

/**
 * 문장별 '시작 시각' 표 — 문장을 클릭하면 그 지점부터 듣기 위해 필요하다.
 *   그 문장 범위에 들어가는 첫 단어의 시각을 문장 시작으로 본다.
 */
export function useSentenceTimes(doc: WordsDoc | null, source: string) {
  return useMemo(() => {
    if (!doc) return [] as Array<{ start: number; end: number; t: number }>;
    const words = doc.words.filter((w) => typeof w.ns === "number");
    return sentenceRanges(source).map((r) => {
      const first = words.find((w) => w.ns! >= r.start && w.ns! < r.end);
      return { ...r, t: first ? first.s : -1 };
    }).filter((r) => r.t >= 0);
  }, [doc, source]);
}

/**
 * 문단을 **문장 단위로 쪼개 렌더**한다. 각 문장은 클릭하면 그 지점부터 듣기(당진시대 방식).
 *   활성 문장은 은은하게 칠하고, 나머지는 마우스를 올렸을 때만 옅게 표시해 '누를 수 있다'를 알린다.
 *
 *   제목도 이걸로 렌더한다. 예전엔 제목만 글자 단위 컴포넌트를 써서 두 가지가 어긋났다(2026-08-20):
 *     · 공백이 강조에서 빠져 **단어마다 노란 칸**이 따로 생겼다(제목이 토막나 보였다).
 *     · 클릭이 안 걸려 있어 제목을 눌러도 처음부터 듣기가 안 됐다.
 */
export function ReadAlongParagraph({ text, offset, active, sentences, onSeek }: {
  text: string;
  offset: number;                                   // 이 문단 앞까지의 공백 제외 누적 순번
  active: { start: number; end: number } | null;
  sentences: Array<{ start: number; end: number; t: number }>;
  onSeek?: (sec: number) => void;
}) {
  // 이 문단이 차지하는 순번 구간에 걸치는 문장 경계로 잘라 조각을 만든다.
  const total = nsCount(text);
  const cuts: number[] = [];
  for (const s of sentences) {
    const rel = s.start - offset;
    if (rel > 0 && rel < total) cuts.push(rel);
  }
  const bounds = [0, ...cuts, total];

  const pieces: Array<{ t: string; ns: number }> = [];
  let ns = 0, buf = "", bi = 1, pieceNs = 0;
  for (const ch of text) {
    if (ns >= bounds[bi] && buf) { pieces.push({ t: buf, ns: pieceNs }); buf = ""; pieceNs = ns; bi++; }
    buf += ch;
    if (!/\s/.test(ch)) ns++;
  }
  if (buf) pieces.push({ t: buf, ns: pieceNs });

  return (
    <>
      {pieces.map((p, i) => {
        const abs = offset + p.ns;
        const sen = sentences.find((s) => abs >= s.start && abs < s.end);
        const on = !!active && abs >= active.start && abs < active.end;
        return (
          <span
            key={i}
            onClick={sen && onSeek ? () => onSeek(sen.t) : undefined}
            title={sen && onSeek ? "이 문장부터 듣기" : undefined}
            className={[
              sen && onSeek ? "cursor-pointer rounded transition-colors" : "",
              on ? "bg-[#FFF0A8]" : sen && onSeek ? "hover:bg-accent-subtle/40" : "",
            ].join(" ")}
          >
            {p.t}
          </span>
        );
      })}
    </>
  );
}

/** 활성 단어가 화면 밖으로 나가면 부드럽게 따라간다(고령 독자 기준: 화면 중앙 근처 유지). */
export function useAutoScroll(active: { start: number; end: number } | null, enabled: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  const lastRef = useRef(-1);
  useEffect(() => {
    if (!enabled || !active) return;
    if (active.start === lastRef.current) return;
    lastRef.current = active.start;
    const el = ref.current?.querySelector("mark");
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top < vh * 0.15 || r.bottom > vh * 0.75) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [active, enabled]);
  return ref;
}

/** 정렬 기준 원문 — 서버(gen-news-audio.mjs)의 script와 **같은 형태**여야 순번이 맞는다. */
export const alignSource = (title: string, body: string) =>
  `${title}.\n${(body || "").replace(/\s+/g, " ").trim()}`;
