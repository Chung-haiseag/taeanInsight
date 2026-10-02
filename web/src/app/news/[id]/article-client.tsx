"use client";

// 자체 기사 리더 — 태안신문으로 나가지 않고 우리 사이트에서 기사를 보여준다.
// 전문은 D1 아카이브에서(우리 쪽 회원 게이트 뒤), 없으면 RSS 발췌로 폴백.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { getNewsItem } from "@/lib/api/news";
import {
  getArchiveArticle,
  getRelatedArchive,
  type ArchiveHit,
} from "@/lib/api/archive";
import { archiveToReader, formatDate, LOW_FAITH, OLD_PRINT_UNTIL, type Reader } from "./reader";
import { useMembership } from "@/lib/use-membership";
import { decodeEntities } from "@/lib/html";
import { segmentQuotes } from "@/lib/quote-highlight";
import { ZoomPanImage } from "@/components/zoom-pan-image";
import { PageViewer } from "@/components/page-viewer";
import { ReadingTracker } from "@/components/reading-tracker";
import { NewsAudio } from "@/components/news-audio";
import { useReadAlong, useActiveRange, useSentenceTimes, ReadAlongParagraph, useAutoScroll, alignSource } from "@/components/read-along";
import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/api/client";
import { CorrectionRequest } from "./correction-request";
import ArticleGraph from "./article-graph";
import { MembershipNudge } from "@/components/membership-nudge";
import { SecHead } from "@/components/editorial";

export default function ArticleClient({ initialArticle }: { initialArticle?: Reader }) {
  const params = useParams<{ id: string }>();
  const [article, setArticle] = useState<Reader | null>(initialArticle ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialArticle);
  // 아카이브 기사는 **무료로 유지**한다(유입·검색). 여기 문턱은 결제가 아니라 로그인이다.
  //   예전엔 localStorage가 이 값을 정했고, '로그인하고 전문 보기' 단추가 로그인 없이
  //   그 값을 켰다 — 이제 서버 세션이 정한다.
  const { state: memberState } = useMembership();
  const loggedIn = memberState === "member" || memberState === "preview";
  // 낭독 재생 위치(초) — 따라읽기 하이라이트가 쓴다. 재생 안 하면 0으로 남아 하이라이트도 없다.
  const [playPos, setPlayPos] = useState(0);
  // 낭독은 '제목 → 본문' 순으로 읽으므로 **제목도 하이라이트 대상**이다(초반 7초가 제목이라
  //   제목을 빼면 재생 직후엔 아무 데도 안 칠해져 기능이 꺼진 것처럼 보인다 — 실제로 그랬다).
  const raWords = useReadAlong(Number(params.id), playPos > 0);
  const raSource = useMemo(
    () => (article ? alignSource(article.title, article.body || "") : ""),
    [article],
  );
  // 문장 시각표 하나를 하이라이트·클릭이 함께 쓴다(따로 계산하면 서로 어긋난다).
  const raSentences = useSentenceTimes(raWords, raSource);
  const raActive = useActiveRange(raSentences, playPos, raWords?.duration ?? 0);
  // 본문 문장 클릭 → 그 지점부터 듣기(당진시대 방식). 재생 전이면 그 위치부터 재생을 시작한다.
  const audioCtl = useRef<{ seekAndPlay: (sec: number) => void } | null>(null);
  const seekTo = useCallback((sec: number) => audioCtl.current?.seekAndPlay(sec), []);

  useEffect(() => {
    if (initialArticle) return; // 서버가 이미 제공(SSR) → 클라 fetch 불필요(이중 fetch 제거)
    (async () => {
      try {
        // 1) D1 아카이브(전문) 우선 — 서버·클라 공통 매핑(archiveToReader)
        setArticle(archiveToReader(await getArchiveArticle(Number(params.id)), Number(params.id)));
      } catch {
        // 2) 아카이브에 없으면 RSS 발췌
        try {
          const n = await getNewsItem(params.id);
          setArticle({
            title: decodeEntities(n.title),
            publishedAt: n.publishedAt,
            author: n.author,
            category: n.category,
            categoryLabel: n.categoryLabel,
            excerpt: decodeEntities(n.excerpt),
            images: [],
            url: n.url,
            source: "rss",
            hasFullText: false,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "기사를 불러오지 못했습니다");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id, initialArticle]);

  if (loading) return <p role="status" className="mx-auto max-w-[48rem] text-ti-ink2">기사를 불러오는 중입니다…</p>;
  if (error || !article)
    return (
      <div className="mx-auto max-w-[48rem] space-y-4">
        <p role="alert" className="rounded-xl border border-[#8A1C14]/30 bg-[#FAD4D1] p-4 text-[#8A1C14]">
          <strong className="mr-1">기사를 불러오지 못했습니다.</strong>{error ?? ""}
        </p>
        <Link href="/news" className="inline-flex min-h-11 items-center font-bold text-ti-petrol-ink underline underline-offset-4">
          ← 뉴스아카이브로
        </Link>
      </div>
    );

  const date = (article.publishedAt ?? "").slice(0, 10);

  // 2026-10 리디자인: 읽는 폭을 한 줄 40em 안팎으로 묶는다(어르신 눈이 줄 끝에서 다음 줄을 잃지 않게).
  return (
    <article className="mx-auto max-w-[48rem] space-y-8">
      {/* 읽기 행동 추적(초개인화) — 렌더 영향 없음 */}
      <ReadingTracker idxno={Number(params.id)} category={article.category} />
      <nav aria-label="이전 목록" className="no-print">
        {/* 광고는 기사 검색에 없다 — 왔던 곳으로 돌려보내야 맞다. */}
        {article.isAd
          ? <Link href="/paper/ads" className="inline-flex min-h-11 items-center font-bold text-ti-petrol-ink underline underline-offset-4">← 옛 광고 목록</Link>
          : <Link href="/news" className="inline-flex min-h-11 items-center font-bold text-ti-petrol-ink underline underline-offset-4">← 뉴스아카이브 목록</Link>}
      </nav>

      {/* 제목 머리 — 분류 → 큰 세리프 제목 → 날짜·기자(신문 1면과 같은 순서) */}
      <header className="space-y-4 border-b-2 border-ti-ink pb-6">
        {article.categoryLabel && <p className="text-[0.95rem] font-bold tracking-[0.06em] text-ti-petrol-ink">{article.categoryLabel}</p>}
        <h1 className="break-keep font-head text-[clamp(1.75rem,4.4vw,2.6rem)] font-black leading-[1.28] tracking-[-0.02em] text-ti-ink">
          {raWords
            ? <ReadAlongParagraph text={article.title} offset={0} active={raActive} sentences={raSentences} onSeek={seekTo} />
            : article.title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[1rem] text-ti-ink2">
          {date ? <time dateTime={date}>{formatDate(article.publishedAt)}</time> : <span>{formatDate(article.publishedAt)}</span>}
          {article.author && <span><span className="sr-only">기자 </span>{article.author}</span>}
          <span className="text-ti-muted">주간태안신문</span>
        </p>
        <div className="no-print flex flex-wrap items-center gap-2 pt-1">
          <NewsAudio idxno={Number(params.id)} onPos={setPlayPos} controlsRef={audioCtl} durationHint={raWords?.duration} />
          <ShareBar idxno={Number(params.id)} title={article.title} />
          <button type="button" onClick={() => window.print()} className={TOOL_PILL}>
            <Icon name="print" /> PDF로 저장
          </button>
        </div>
        {raWords && (
          <p className="no-print rounded-xl bg-ti-sunk px-4 py-3 text-[0.95rem] text-ti-ink2">
            기사 본문을 요약 없이 그대로 읽어 드립니다. 읽는 곳이 본문에 노랗게 표시되고,{" "}
            <strong className="font-bold text-ti-ink">문장을 누르면 그 문장부터</strong> 들을 수 있습니다.
          </p>
        )}
      </header>

      {loggedIn && article.hasFullText ? (
        <FullBody article={article} idxno={Number(params.id)} active={raActive} hasWords={!!raWords} sentences={raSentences} onSeek={seekTo} />
      ) : (
        <div className="mx-auto max-w-[40em] space-y-6">
          {/* 리드(발췌) */}
          <p className="text-[1.12rem] leading-[1.85] text-ti-ink"><QuotedText text={article.excerpt} /></p>
          {loggedIn ? (
            <div className="rounded-xl border border-ti-line bg-ti-sunk p-4 text-ti-ink2">
              <Icon name="books" /> 전체 본문은 아카이브에 옮겨지면 이 자리에 나옵니다. 지금은 앞부분만 보여 드립니다.
              {article.url && (
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="ml-1 font-bold text-ti-petrol-ink underline underline-offset-4">
                  태안신문 원문 보기<span className="sr-only"> (새 창)</span>
                </a>
              )}
            </div>
          ) : (
            <MemberGate hasFullText={article.hasFullText} idxno={Number(params.id)} />
          )}
        </div>
      )}

      <MembershipNudge
        source="article"
        title="37년 태안이 여기 다 있습니다"
        subtitle="1990년부터의 기사 무제한 검색·기사 낭독·주간 인사이트 리포트 — 멤버십으로. 사전 신청자는 첫 달 무료."
      />

      <ArticleGraph idxno={Number(params.id)} />

      <RelatedArticles idxno={Number(params.id)} />

    </article>
  );
}

// 기사 도구 단추(듣기 옆 공유·오디오·PDF) — 44px 높이, 흰 바탕 + 먹선
const TOOL_PILL = "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ti-line bg-ti-surface px-4 text-[0.95rem] font-semibold text-ti-ink hover:border-ti-petrol";

// 공유 + 오디오(나레이션) 링크·임베드 복사. 나레이션 URL은 공개·CORS 전면개방이라 어디서든 재생/임베드 가능.
function ShareBar({ idxno, title }: { idxno: number; title: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const audioUrl = `${API_BASE_URL}/api/audio/news/${idxno}`;
  const embed = `<audio controls preload="none" src="${audioUrl}"></audio>`;
  const flash = (t: string) => { setMsg(t); window.setTimeout(() => setMsg(null), 1800); };
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); flash(label); } catch { flash("복사 실패 — 길게 눌러 복사하세요"); }
    setMenu(false);
  };
  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const nav = navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === "function") { try { await nav.share({ title, url }); } catch { /* 사용자 취소 */ } return; }
    await copy(url, "링크가 복사됐어요");
  };
  const pill = TOOL_PILL;
  return (
    <div className="relative inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={share} className={pill}><Icon name="link" /> 공유</button>
      <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu" className={pill}><Icon name="speaker" /> 오디오</button>
      {menu && (
        <div className="absolute left-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-xl border border-ti-line bg-ti-surface py-1 shadow-lift" role="menu">
          <button type="button" role="menuitem" onClick={() => copy(audioUrl, "오디오 링크 복사됨")} className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-[0.95rem] text-ti-ink hover:bg-ti-sunk"><Icon name="link" /> 오디오 링크 복사</button>
          <button type="button" role="menuitem" onClick={() => copy(embed, "임베드 코드 복사됨")} className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-[0.95rem] text-ti-ink hover:bg-ti-sunk"><Icon name="doc" /> 임베드 코드 복사</button>
        </div>
      )}
      {msg && <span role="status" className="whitespace-nowrap text-[0.9rem] font-bold text-ti-petrol-ink">{msg}</span>}
    </div>
  );
}

function RelatedArticles({ idxno }: { idxno: number }) {
  const [items, setItems] = useState<ArchiveHit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getRelatedArchive(idxno, page)
      .then((r) => {
        if (!alive) return;
        setItems(r.items ?? []);
        setTotal(r.total ?? 0);
        setPageSize(r.pageSize ?? 6);
      })
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [idxno, page]);

  if (!loading && total === 0) return null;
  const pages = Math.ceil(total / pageSize);

  return (
    <section aria-labelledby="related-news-title" className="no-print">
      <SecHead id="related-news-title" title="관련 뉴스" note={total > 0 ? `모두 ${total.toLocaleString()}건 · 최근 기사부터` : undefined} />
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
        {items.map((it) => {
          const d = (it.published_at ?? "").slice(0, 10);
          return (
            <li key={it.idxno} className="min-w-0">
              <Link
                href={`/news/${it.idxno}`}
                className="group flex h-full gap-3 rounded-xl border border-ti-line bg-ti-surface p-3.5 hover:border-ti-petrol"
              >
                {it.lead_image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.lead_image} alt="" className="h-16 w-20 shrink-0 rounded-lg bg-ti-sunk object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                )}
                <div className="min-w-0">
                  {d && <time dateTime={d} className="block text-[0.88rem] tabular-nums text-ti-muted">{d.replace(/-/g, ".")}</time>}
                  <p className="mt-0.5 line-clamp-2 font-head text-[1.02rem] font-bold leading-snug text-ti-ink group-hover:underline group-hover:underline-offset-4">{decodeEntities(it.title)}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {pages > 1 && <Pager page={page} pages={pages} onGo={setPage} />}
    </section>
  );
}

function Pager({ page, pages, onGo }: { page: number; pages: number; onGo: (p: number) => void }) {
  // 현재 페이지 주변 일부 + 처음/끝
  const win = 2;
  const nums: number[] = [];
  for (let p = Math.max(1, page - win); p <= Math.min(pages, page + win); p++) nums.push(p);
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 pt-4" aria-label="관련 뉴스 쪽 이동">
      <PagerBtn disabled={page <= 1} onClick={() => onGo(page - 1)} label="이전 쪽">
        ← 이전
      </PagerBtn>
      {nums[0] > 1 && (
        <>
          <PagerBtn onClick={() => onGo(1)}>1</PagerBtn>
          {nums[0] > 2 && <span className="px-1 text-ti-muted" aria-hidden>…</span>}
        </>
      )}
      {nums.map((p) => (
        <PagerBtn key={p} active={p === page} onClick={() => onGo(p)}>
          {p}
        </PagerBtn>
      ))}
      {nums[nums.length - 1] < pages && (
        <>
          {nums[nums.length - 1] < pages - 1 && <span className="px-1 text-ti-muted" aria-hidden>…</span>}
          <PagerBtn onClick={() => onGo(pages)}>{pages}</PagerBtn>
        </>
      )}
      <PagerBtn disabled={page >= pages} onClick={() => onGo(page + 1)} label="다음 쪽">
        다음 →
      </PagerBtn>
    </nav>
  );
}

function PagerBtn({
  children,
  active,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string; // 숫자 단추는 'N쪽'으로 읽히게
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      aria-label={label ?? (typeof children === "number" ? `${children}쪽` : undefined)}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 text-[0.95rem] tabular-nums ${
        active ? "border-ti-navy bg-ti-navy font-bold text-ti-on-navy" : "border-ti-line bg-ti-surface font-semibold text-ti-ink hover:border-ti-petrol"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

/** 공백 제외 글자 수 — 따라읽기 순번 계산의 기준(정렬 데이터와 동일 규칙). */
const nsLen = (s: string) => s.replace(/\s/g, "").length;

function splitParagraphs(text: string): string[] {
  const t = (text || "").trim();
  if (!t) return [];
  // 백필이 문단(\n)을 보존했으면 그대로, 아니면(한 덩어리) 문장 단위로 묶어 문단화
  if (t.includes("\n")) return t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const sentences = t.split(/(?<=[.?!”"’])\s+/).filter(Boolean);
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i + 3).join(" "));
  return paras.length ? paras : [t];
}

// 인용부호("…") 구간을 강조색으로 렌더 — 발언·인용을 눈에 띄게.
function QuotedText({ text }: { text: string }) {
  return (
    <>
      {segmentQuotes(text).map((s, i) =>
        s.quote ? (
          <span key={i} className="font-semibold text-ti-petrol-ink">{s.t}</span>
        ) : (
          <span key={i}>{s.t}</span>
        ),
      )}
    </>
  );
}

function FullBody({ article, idxno, active, hasWords, sentences, onSeek }: {
  article: Reader;
  idxno: number;
  active: { start: number; end: number } | null;   // 따라읽기 활성 구간(부모에서 계산 — 제목과 공유)
  hasWords: boolean;
  sentences: Array<{ start: number; end: number; t: number }>;
  onSeek?: (sec: number) => void;
}) {
  const allParas = splitParagraphs(article.body || "");
  const bodyRef = useAutoScroll(active, hasWords);
  const isEbook = idxno >= 90000001 && idxno <= 90099999;
  const leadImg = article.images[0] ?? null;
  // 사진설명: 사진이 있고 첫 문단이 짧으면(≤45자 = 캡션) 본문에서 분리해 사진 아래 중앙에 배치.
  const hasCaption = !!leadImg && allParas.length > 1 && allParas[0].length <= 45;
  const paras = hasCaption ? allParas.slice(1) : allParas;
  const restImages = leadImg ? article.images.slice(1) : article.images;
  return (
    <div className="space-y-8">
      {/* 리드 사진 — 맨 위 + 사진설명(가운데) */}
      {leadImg && (
        <figure className="m-0 space-y-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={leadImg} alt={hasCaption ? allParas[0] : article.title} className="mx-auto block h-auto rounded-xl bg-ti-sunk" style={{ maxWidth: "min(100%, 720px)", maxHeight: "34rem" }} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          {hasCaption && <figcaption className="mx-auto max-w-[40em] text-center text-[0.95rem] text-ti-ink2">{allParas[0]}</figcaption>}
        </figure>
      )}

      {/* 본문 — 한 줄 40em·글자 1.08rem·줄간격 1.85: 어르신이 줄을 놓치지 않는 폭과 숨 */}
      {/*   따라읽기: 정렬 원문이 `제목.\n본문`이라 본문 문단의 순번은 제목 글자 수부터 시작한다. */}
      <div ref={bodyRef as React.RefObject<HTMLDivElement>} className="mx-auto max-w-[40em] space-y-[1.1em] break-keep text-[1.08rem] leading-[1.85] text-ti-ink">
        {(() => {
          let off = nsLen(`${article.title}.`);
          if (hasCaption) off += nsLen(allParas[0]);
          return paras.map((p, i) => {
            const start = off;
            off += nsLen(p);
            return (
              <p key={i}>
                {hasWords
                  ? <ReadAlongParagraph text={p} offset={start} active={active} sentences={sentences} onSeek={onSeek} />
                  : <QuotedText text={p} />}
              </p>
            );
          });
        })()}
      </div>

      {/* 나머지 본문 사진(리드 외) */}
      {restImages.length > 0 && (
        <div className="space-y-5">
          {restImages.map((src) => (
            // 자연 크기 표시(작으면 작게), 단 본문 폭·높이 상한만 둠 — 작은 사진이 흐릿하게 늘어나지 않게
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={`${article.title} 본문 사진`} className="mx-auto block h-auto rounded-xl bg-ti-sunk" style={{ maxWidth: "min(100%, 640px)", maxHeight: "34rem" }} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ))}
        </div>
      )}

      {/* OCR 불완전 안내: 저충실도이거나 1990~1994 옛 신문이면 표시 (본문 하단, 진한 색) */}
      {article.pageImage && (
        (typeof article.faithfulness === "number" && article.faithfulness < LOW_FAITH) ||
        Number((article.publishedAt || "").slice(0, 4)) <= OLD_PRINT_UNTIL
      ) && (
        <p className="mx-auto max-w-[40em] rounded-xl border-l-4 border-[#6B3F00] bg-[#FCE3B5] px-4 py-3 font-semibold text-[#6B3F00]">
          <strong className="mr-1 font-black">알림</strong>옛 지면을 글자로 옮기는 과정이 완벽하지 않습니다. 정확한 내용은 아래 <span className="underline underline-offset-4">원본 지면</span>에서 확인하세요.
        </p>
      )}

      {/* 전자북: 오탈자 수정 요청(회원) — 본문 드래그 → 요청 폼 */}
      {isEbook && <CorrectionRequest idxno={idxno} />}

      {/* 전자북: 원본 지면 스캔 (디지털화 본문과 대조 가능) */}
      {article.pageImage && <OriginalPage src={article.pageImage} label={article.pageLabel ?? ""} boxes={article.pageBoxes ?? undefined} date={(article.publishedAt ?? "").slice(0, 10)} />}

      {/* 출처 표기 */}
      <div className="mx-auto flex max-w-[40em] flex-wrap items-center justify-between gap-2 border-t border-ti-line pt-4">
        <span className="text-[0.95rem] text-ti-muted">출처: 주간태안신문</span>
        {article.url && (
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-bold text-ti-petrol-ink underline underline-offset-4">
            태안신문 원문 보기<span className="sr-only"> (새 창)</span>
          </a>
        )}
      </div>
    </div>
  );
}

function MemberGate({ hasFullText, idxno }: { hasFullText: boolean; idxno: number }) {
  return (
    <div aria-labelledby="member-gate-title" role="region" className="space-y-4 rounded-[18px] border-2 border-ti-petrol bg-ti-petrol-soft p-6 text-center md:p-8">
      <p className="eyebrow justify-center"><Icon name="lock" /> 로그인하면 보입니다</p>
      <h2 id="member-gate-title" className="break-keep font-head text-[1.35rem] font-bold leading-snug text-ti-ink">
        {hasFullText ? "이 기사의 전문은 로그인하시면 보실 수 있습니다" : "로그인하시면 더 많은 기능을 이용하실 수 있어요"}
      </h2>
      <p className="text-ti-ink2">
        아카이브 기사는 회원가입만 하시면 무료입니다. 결제는 필요하지 않습니다.
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-1">
        <Link href={`/login?redirect=${encodeURIComponent(`/news/${idxno}`)}`} className="btn-accent">
          로그인하기
        </Link>
        <Link href="/me/onboarding" className="btn-ghost">
          회원가입
        </Link>
      </div>
    </div>
  );
}

// 전자북 원본 지면 — 토글로 열 때만 로드, 클릭하면 전용 뷰어(확대·이동)로 열람
function OriginalPage({ src, label, boxes, date }: { src: string; label: string; boxes?: Array<{ x: number; y: number; w: number; h: number }>; date?: string }) {
  const [open, setOpen] = useState(false);
  const [viewer, setViewer] = useState(false);
  const fullSrc = src.replace(/\.jpg(\?|$)/, "full.jpg$1"); // page_03.jpg → page_03full.jpg
  return (
    <section aria-label="원본 지면" className="rounded-[18px] border border-ti-line bg-ti-sunk">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left font-bold text-ti-ink"
        aria-expanded={open}
      >
        <span>원본 지면 보기 {label && <span className="ml-1 font-normal text-ti-ink2">({label})</span>}</span>
        <span className="shrink-0 text-[0.95rem] font-semibold text-ti-petrol-ink">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-[0.95rem] text-ti-ink2">
              주간태안신문 원본 지면 스캔입니다. ＋ − 단추로 키우고 끌어서 움직이세요.
              {boxes?.length ? <strong className="ml-1 font-bold text-[#8A1C14]">붉게 칠한 곳이 이 기사입니다.</strong> : null}
            </p>
            <span className="flex flex-wrap items-center gap-2">
              {/* 지면 넘겨보기는 상단 메뉴가 아니라 **여기서 이어진다** — 기사를 읽다
                  '이 날 신문 전체를 보고 싶다'가 자연스러운 흐름이다. */}
              {/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") && (
                <Link
                  href={`/paper/${date!.slice(0, 4)}/${date}`}
                  className={TOOL_PILL}
                >
                  이 날 신문 전체 보기 →
                </Link>
              )}
              <button
                type="button"
                onClick={() => setViewer(true)}
                className={TOOL_PILL}
              >
                <Icon name="expand" /> 크게 보기
              </button>
            </span>
          </div>
          <ZoomPanImage src={src} fullSrc={fullSrc} maxHeightClass="max-h-[40rem]" regions={boxes} />
        </div>
      )}
      {viewer && <PageViewer src={fullSrc} label={label} onClose={() => setViewer(false)} />}
    </section>
  );
}
