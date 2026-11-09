"use client";

// 회차 화면을 **떠나지 않고** 옆에서 기사를 읽는다.
//
//   왜: 목록을 누르면 /news/<번호> 로 나가 버렸다. 한 회차가 여섯 기사를 다루는데,
//   하나 읽고 뒤로 가고 또 하나 읽고 뒤로 가야 했다. 어디까지 읽었는지도 잃는다.
//   '당진의 기억'(djmemory.com/podcast)은 옆 패널에서 열고 `이 회의 기사 2/6` 으로 넘긴다.
//
//   정직하게 적는 것들:
//   - 못 불러오면 **그렇게 적는다**. 빈 패널을 띄워 놓고 아무 말 안 하지 않는다.
//   - 전문이 없는 기사가 있다(RSS 만 있고 아카이브 백필 전). 그때는 발췌를 보여 주고
//     "전문은 기사 화면에서" 라 적는다 — 없는 글을 지어내거나 빈 칸으로 두지 않는다.
//   - 맨 아래 '기사 화면에서 보기'를 늘 둔다. 듣기·지면보기·수정 요청은 거기 있다.
//     패널은 읽기만 한다 — 기사 화면이 하는 일을 베끼기 시작하면 두 화면을 다 고쳐야 한다.
//
//   ⚠ 소리: 이 패널은 떠 있는 재생기(audio-dock, z-40)를 덮는다. 그래서 **지금 나오는 것**의
//     조작 단추를 패널 머리에 둔다 — 같은 재생기(singleton)를 그대로 쓴다. 두 번째 재생기를
//     만들지 않는다(2026-11-06 '기사 듣기' 가 두 군데서 울던 사고와 같은 자리).
//     아무것도 안 나오고 있으면 그 줄을 아예 안 그린다 — 죽은 단추를 보여 주지 않는다.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ArticlePhoto } from "@/components/article-photo";
import { QuotedText } from "@/components/quoted-text";
import { clock } from "@/components/audio/clock";
import { getPlayer } from "@/components/audio/singleton";
import { usePlayerSnapshot } from "@/components/audio/use-player";
import { readBody } from "@/lib/article-body";
import { getArchiveArticle } from "@/lib/api/archive";
import { archiveToReader, formatDate, type Reader } from "@/app/news/[id]/reader";
import type { EpisodeArticle } from "@/lib/api/reports";

const SKIP = 15; // 초 — '-15초/+15초'는 팟캐스트 재생기의 관례다

// ⚠ 이 프로젝트의 `sm` 은 **320px** 이다(tailwind.config.ts, PRD §7.6). 흔한 640px 이 아니다.
//   처음에 `sm:w-[48vw]` 로 썼더니 휴대폰(390px)에서도 옆 패널 규칙이 걸려 패널이 **240px 짜리
//   쪽지**가 됐다 — 제목이 여섯 줄로 쪼개지고 머리 단추가 '−15 초', '닫 기' 로 갈라졌다.
//   옆에 나란히 두는 배치는 **md(768px)** 부터다. 그 아래는 화면을 통째로 쓴다.

type Load = { st: "loading" } | { st: "ok"; article: Reader } | { st: "fail" };

/** 지금 나오는 소리의 조작 줄. 나오는 게 없으면 그리지 않는다. */
function NowPlaying() {
  const snap = usePlayerSnapshot();
  const p = getPlayer();
  if (!snap.track) return null;
  const playing = snap.st === "playing";
  const btn = "whitespace-nowrap rounded-full border border-ti-line px-3 py-1.5 text-[0.9rem] text-ti-ink hover:bg-ti-sunk focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)]";
  return (
    <div className="flex items-center gap-2 border-b border-ti-line px-4 py-2.5">
      <button
        type="button"
        className={btn}
        aria-label={playing ? "멈춤" : "듣기"}
        onClick={() => (playing ? p.pause() : void p.play(snap.track!))}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <button type="button" className={btn} onClick={() => p.seek(Math.max(0, snap.pos - SKIP))}>−{SKIP}초</button>
      <button type="button" className={btn} onClick={() => p.seek(snap.pos + SKIP)}>+{SKIP}초</button>
      <span className="ml-auto whitespace-nowrap text-[0.9rem] tabular-nums text-ti-muted">
        {clock(snap.pos)}{snap.dur > 0 && ` / ${clock(snap.dur)}`}
      </span>
    </div>
  );
}

export function ArticlePanel({
  articles, index, onIndex, onClose,
}: {
  articles: EpisodeArticle[];
  /** 몇 번째 기사를 펴 둘까. null 이면 패널이 닫혀 있다. */
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const open = index !== null && !!articles[index];
  const current = open ? articles[index] : null;
  const [load, setLoad] = useState<Load>({ st: "loading" });
  // 한 번 받은 기사는 들고 있는다 — 앞뒤로 오가며 읽는 화면이라 매번 다시 받으면 깜빡인다.
  const cache = useRef(new Map<number, Reader>());
  const panelRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // 기사 받아오기
  useEffect(() => {
    if (!current) return;
    const hit = cache.current.get(current.idxno);
    if (hit) { setLoad({ st: "ok", article: hit }); return; }
    let alive = true;
    setLoad({ st: "loading" });
    getArchiveArticle(current.idxno)
      .then((a) => {
        const r = archiveToReader(a, current.idxno);
        cache.current.set(current.idxno, r);
        if (alive) setLoad({ st: "ok", article: r });
      })
      .catch(() => { if (alive) setLoad({ st: "fail" }); });
    return () => { alive = false; };
  }, [current]);

  // 열고 닫을 때: ESC 로 닫기 · 뒤 화면 스크롤 잠금 · 포커스 옮겼다 되돌리기
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  const go = useCallback((d: number) => {
    if (index === null) return;
    const n = index + d;
    if (n >= 0 && n < articles.length) onIndex(n);
  }, [index, articles.length, onIndex]);

  if (!open || !current) return null;

  const nav = "whitespace-nowrap rounded-full border border-ti-line px-3 py-1.5 text-[0.95rem] text-ti-ink disabled:opacity-35 hover:bg-ti-sunk focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)]";

  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end">
      {/* 바깥을 눌러도 닫힌다. 작은 화면에서는 패널이 전체를 쓰므로 그릴 자리가 없다. */}
      <button type="button" aria-label="닫기" onClick={onClose} className="hidden flex-1 bg-ti-ink/30 md:block" />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`이 회의 기사 ${index + 1} / ${articles.length}`}
        className="flex h-full w-full flex-col bg-ti-surface shadow-2xl outline-none md:w-[min(38rem,52vw)]"
      >
        <NowPlaying />

        <header className="flex items-center gap-2 border-b border-ti-line px-4 py-3">
          <button type="button" className={nav} onClick={() => go(-1)} disabled={index === 0} aria-label="앞 기사">◀</button>
          <span className="whitespace-nowrap text-[0.95rem] text-ti-muted">
            <span className="hidden md:inline">이 회의 </span>기사{" "}
            <b className="tabular-nums text-ti-ink">{index + 1}</b> / <span className="tabular-nums">{articles.length}</span>
          </span>
          <button type="button" className={nav} onClick={() => go(1)} disabled={index === articles.length - 1} aria-label="다음 기사">▶</button>
          <button type="button" className={`${nav} ml-auto`} onClick={onClose} aria-label="닫기"><span className="hidden md:inline">닫기 </span>✕</button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6 md:px-7">
          <h2 className="break-keep font-head text-[1.45rem] font-bold leading-[1.35] text-ti-ink md:text-[1.6rem]">
            {load.st === "ok" ? load.article.title : current.title}
          </h2>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ti-line pb-4 text-[0.95rem] text-ti-muted">
            <span>태안신문</span>
            <time dateTime={(current.publishedAt ?? "").slice(0, 10)}>{formatDate(current.publishedAt)}</time>
            {load.st === "ok" && load.article.author && <span>{load.article.author}</span>}
          </p>

          {load.st === "loading" && <p className="mt-8 text-ti-muted">기사를 불러오는 중입니다…</p>}

          {load.st === "fail" && (
            <p className="mt-8 text-ti-ink2">
              기사를 불러오지 못했습니다. 잠시 뒤 다시 열어 보시거나, 아래 ‘기사 화면에서 보기’로 가 보세요.
            </p>
          )}

          {load.st === "ok" && <Body article={load.article} />}

          <p className="mt-10 border-t border-ti-line pt-5">
            <Link
              href={`/news/${current.idxno}`}
              className="text-[1.02rem] text-ti-petrol-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ti-focus)]"
            >
              기사 화면에서 보기 →
            </Link>
          </p>
        </div>
      </aside>
    </div>
  );
}

function Body({ article }: { article: Reader }) {
  const { caption, paras, leadImage, restImages } = readBody(article.body || "", article.images);
  const empty = paras.length === 0;
  return (
    <div className="mt-6 space-y-6">
      {leadImage && (
        <ArticlePhoto
          src={leadImage}
          alt={caption ?? article.title}
          maxWidth="100%"
          caption={caption ?? undefined}
          captionClassName="text-center text-[0.92rem] text-ti-ink2"
        />
      )}

      {/* 기사 화면과 같은 활자 리듬(1.08rem · 줄간격 1.85) — 좁아졌다고 글씨까지 줄이지 않는다. */}
      <div className="space-y-[1.1em] break-keep text-[1.08rem] leading-[1.85] text-ti-ink">
        {empty
          ? <p className="text-ti-ink2">{article.excerpt || "이 기사는 전문이 아직 들어오지 않았습니다."} <span className="text-ti-muted">전문은 기사 화면에서 보실 수 있습니다.</span></p>
          : paras.map((p, i) => <p key={i}><QuotedText text={p} /></p>)}
      </div>

      {restImages.length > 0 && (
        <div className="space-y-4">
          {restImages.map((src) => <ArticlePhoto key={src} src={src} alt={`${article.title} 본문 사진`} maxWidth="100%" />)}
        </div>
      )}
    </div>
  );
}
