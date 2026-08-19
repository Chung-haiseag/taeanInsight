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
import { getDemoHomeState, setDemoHomeState, isMockMode } from "@/lib/mock/addons";
import { decodeEntities } from "@/lib/html";
import { segmentQuotes } from "@/lib/quote-highlight";
import { ZoomPanImage } from "@/components/zoom-pan-image";
import { PageViewer } from "@/components/page-viewer";
import { ReadingTracker } from "@/components/reading-tracker";
import { NewsAudio } from "@/components/news-audio";
import { useReadAlong, useActiveRange, useSentenceTimes, ReadAlongText, ReadAlongParagraph, useAutoScroll, alignSource } from "@/components/read-along";
import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/api/client";
import { CorrectionRequest } from "./correction-request";
import ArticleGraph from "./article-graph";
import { MembershipNudge } from "@/components/membership-nudge";

export default function ArticleClient({ initialArticle }: { initialArticle?: Reader }) {
  const params = useParams<{ id: string }>();
  const [article, setArticle] = useState<Reader | null>(initialArticle ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialArticle);
  const [member, setMember] = useState(false);
  // 낭독 재생 위치(초) — 따라읽기 하이라이트가 쓴다. 재생 안 하면 0으로 남아 하이라이트도 없다.
  const [playPos, setPlayPos] = useState(0);
  // 낭독은 '제목 → 본문' 순으로 읽으므로 **제목도 하이라이트 대상**이다(초반 7초가 제목이라
  //   제목을 빼면 재생 직후엔 아무 데도 안 칠해져 기능이 꺼진 것처럼 보인다 — 실제로 그랬다).
  const raWords = useReadAlong(Number(params.id), playPos > 0);
  const raSource = useMemo(
    () => (article ? alignSource(article.title, article.body || "") : ""),
    [article],
  );
  const raActive = useActiveRange(raWords, raSource, playPos);
  const raSentences = useSentenceTimes(raWords, raSource);
  // 본문 문장 클릭 → 그 지점부터 듣기(당진시대 방식). 재생 전이면 그 위치부터 재생을 시작한다.
  const audioCtl = useRef<{ seekAndPlay: (sec: number) => void } | null>(null);
  const seekTo = useCallback((sec: number) => audioCtl.current?.seekAndPlay(sec), []);

  useEffect(() => {
    setMember(getDemoHomeState() === "entitled");
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

  if (loading) return <p className="text-sm text-foreground-muted">불러오는 중…</p>;
  if (error || !article)
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600 border border-red-200 rounded-lg p-4 bg-red-50">⚠️ {error ?? "없음"}</p>
        <Link href="/news" className="text-sm font-semibold text-brand">
          ← 태안뉴스로
        </Link>
      </div>
    );

  return (
    <article className="mx-auto max-w-4xl space-y-6">
      {/* 읽기 행동 추적(초개인화) — 렌더 영향 없음 */}
      <ReadingTracker idxno={Number(params.id)} category={article.category} />
      <div className="no-print flex gap-4 text-sm text-foreground-muted">
        <Link href="/news" className="hover:text-brand">← 뉴스아카이브</Link>
      </div>

      <header className="space-y-3 border-b border-brand/10 pb-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">
            {article.categoryLabel}
          </span>
          <span className="text-foreground-muted">{formatDate(article.publishedAt)}</span>
          {article.author && <span className="text-foreground-muted">· {article.author}</span>}
        </div>
        <h1 className="text-display-sm font-bold text-brand">
          {raActive ? <ReadAlongText text={article.title} active={raActive} offset={0} /> : article.title}
        </h1>
        <div className="no-print flex flex-wrap items-center gap-2 pt-1">
          <NewsAudio idxno={Number(params.id)} onPos={setPlayPos} controlsRef={audioCtl} />
          <ShareBar idxno={Number(params.id)} title={article.title} />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-background px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5"
          >
            <Icon name="print" /> PDF로 저장
          </button>
        </div>
        {raWords && (
          <p className="no-print text-xs text-foreground-muted">
            기사 본문을 요약 없이 그대로 읽습니다. 읽는 위치가 본문에 표시되고,{" "}
            <strong className="font-semibold text-brand">문장을 클릭하면 그 지점부터</strong> 들을 수 있습니다.
          </p>
        )}
      </header>

      {member && article.hasFullText ? (
        <FullBody article={article} idxno={Number(params.id)} active={raActive} hasWords={!!raWords} sentences={raSentences} onSeek={seekTo} />
      ) : (
        <>
          {/* 리드(발췌) */}
          <p className="text-lg leading-relaxed text-foreground"><QuotedText text={article.excerpt} /></p>
          {member ? (
            <div className="rounded-lg border border-brand/15 bg-brand/[0.03] p-4 text-sm text-foreground-muted">
              <Icon name="books" /> 전체 본문은 아카이브에 적재되면 이 자리에 표시됩니다. 지금은 발췌만 제공됩니다.
              {article.url && (
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="ml-1 font-semibold text-brand hover:underline">
                  원문 보기 ↗
                </a>
              )}
            </div>
          ) : (
            <MemberGate
              hasFullText={article.hasFullText}
              onUnlock={() => { setDemoHomeState("entitled"); setMember(true); }}
            />
          )}
        </>
      )}

      <MembershipNudge
        source="article"
        title="37년 태안이 여기 다 있습니다"
        subtitle="1990년부터의 기사 무제한 검색·기사 낭독·주간 인사이트 리포트 — 멤버십으로. 사전 신청자는 첫 달 무료."
      />

      <ArticleGraph idxno={Number(params.id)} />

      <RelatedArticles idxno={Number(params.id)} />

      {isMockMode() && (
        <DemoMemberToggle
          member={member}
          onChange={(v) => {
            setDemoHomeState(v ? "entitled" : "preview");
            setMember(v);
          }}
        />
      )}
    </article>
  );
}

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
  const pill = "inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-background px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5";
  return (
    <div className="relative inline-flex items-center gap-2">
      <button type="button" onClick={share} className={pill}><Icon name="link" /> 공유</button>
      <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu" className={pill}><Icon name="speaker" /> 오디오</button>
      {menu && (
        <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border border-brand/15 bg-background py-1 shadow-lift" role="menu">
          <button type="button" role="menuitem" onClick={() => copy(audioUrl, "오디오 링크 복사됨")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-brand/5"><Icon name="link" /> 오디오 링크 복사</button>
          <button type="button" role="menuitem" onClick={() => copy(embed, "임베드 코드 복사됨")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-brand/5"><Icon name="doc" /> 임베드 코드 복사</button>
        </div>
      )}
      {msg && <span className="whitespace-nowrap text-xs font-semibold text-accent">{msg}</span>}
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
    <section className="no-print border-t border-brand/10 pt-6 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow"><span className="inline-block h-px w-6 bg-accent" aria-hidden />관련 뉴스</p>
        {total > 0 && <span className="text-xs text-foreground-muted">총 {total}건 · 최근순</span>}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.idxno}>
            <Link
              href={`/news/${it.idxno}`}
              className="flex gap-3 rounded-lg border border-brand/12 p-3 hover:border-brand/30 hover:bg-brand/[0.02]"
            >
              {it.lead_image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.lead_image} alt="" className="h-12 w-16 shrink-0 rounded object-cover bg-brand/5" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              )}
              <div className="min-w-0">
                <p className="text-xs text-foreground-muted">{(it.published_at ?? "").slice(0, 10)}</p>
                <p className="text-sm font-semibold text-brand line-clamp-2">{decodeEntities(it.title)}</p>
              </div>
            </Link>
          </li>
        ))}
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
    <nav className="flex flex-wrap items-center justify-center gap-1 pt-2 text-sm" aria-label="관련 뉴스 페이지">
      <PagerBtn disabled={page <= 1} onClick={() => onGo(page - 1)}>
        ←
      </PagerBtn>
      {nums[0] > 1 && (
        <>
          <PagerBtn onClick={() => onGo(1)}>1</PagerBtn>
          {nums[0] > 2 && <span className="px-1 text-foreground-muted">…</span>}
        </>
      )}
      {nums.map((p) => (
        <PagerBtn key={p} active={p === page} onClick={() => onGo(p)}>
          {p}
        </PagerBtn>
      ))}
      {nums[nums.length - 1] < pages && (
        <>
          {nums[nums.length - 1] < pages - 1 && <span className="px-1 text-foreground-muted">…</span>}
          <PagerBtn onClick={() => onGo(pages)}>{pages}</PagerBtn>
        </>
      )}
      <PagerBtn disabled={page >= pages} onClick={() => onGo(page + 1)}>
        →
      </PagerBtn>
    </nav>
  );
}

function PagerBtn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={`min-w-8 rounded px-2.5 py-1 ${
        active ? "bg-brand text-background font-semibold" : "text-foreground-muted hover:bg-brand/5"
      } disabled:opacity-40`}
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
          <span key={i} className="font-medium text-accent">{s.t}</span>
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
    <div className="space-y-5">
      {/* 리드 사진 — 맨 위 + 사진설명(중앙) */}
      {leadImg && (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={leadImg} alt={hasCaption ? allParas[0] : article.title} className="mx-auto block h-auto rounded-lg bg-brand/5" style={{ maxWidth: "min(100%, 720px)", maxHeight: "34rem" }} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          {hasCaption && <figcaption className="text-center text-sm text-foreground-muted">{allParas[0]}</figcaption>}
        </figure>
      )}

      {/* 본문 — 줄간격·문단간격은 가독성 기준(과도한 여백 방지) */}
      {/*   따라읽기: 정렬 원문이 `제목.\n본문`이라 본문 문단의 순번은 제목 글자 수부터 시작한다. */}
      <div ref={bodyRef as React.RefObject<HTMLDivElement>} className="space-y-4 text-[1.02rem] leading-[1.7] text-foreground">
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
        <div className="space-y-3">
          {restImages.map((src) => (
            // 자연 크기 표시(작으면 작게), 단 본문 폭·높이 상한만 둠 — 작은 사진이 흐릿하게 늘어나지 않게
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={`${article.title} 본문 사진`} className="mx-auto block h-auto rounded-lg bg-brand/5" style={{ maxWidth: "min(100%, 640px)", maxHeight: "34rem" }} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ))}
        </div>
      )}

      {/* OCR 불완전 안내: 저충실도이거나 1990~1994 옛 신문이면 표시 (본문 하단, 진한 색) */}
      {article.pageImage && (
        (typeof article.faithfulness === "number" && article.faithfulness < LOW_FAITH) ||
        Number((article.publishedAt || "").slice(0, 4)) <= OLD_PRINT_UNTIL
      ) && (
        <p className="rounded-md border-l-4 border-amber-600 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-900">
          ⚠ 완벽하게 OCR이 되지 않아, 기사 내용을 확인하려면 아래 <span className="underline">원본 지면</span>을 확인하세요.
        </p>
      )}

      {/* 전자북: 오탈자 수정 요청(회원) — 본문 드래그 → 요청 폼 */}
      {isEbook && <CorrectionRequest idxno={idxno} />}

      {/* 전자북: 원본 지면 스캔 (디지털화 본문과 대조 가능) */}
      {article.pageImage && <OriginalPage src={article.pageImage} label={article.pageLabel ?? ""} />}

      {/* 출처 표기 */}
      <div className="flex items-center justify-between border-t border-brand/10 pt-4 text-sm">
        <span className="text-foreground-muted">출처 · 주간태안신문</span>
        {article.url && (
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
            원문 보기 ↗
          </a>
        )}
      </div>
    </div>
  );
}

function MemberGate({ hasFullText, onUnlock }: { hasFullText: boolean; onUnlock: () => void }) {
  return (
    <div className="relative rounded-2xl border border-accent/40 bg-accent-subtle/20 p-7 text-center space-y-4">
      <p className="eyebrow justify-center"><Icon name="lock" /> 회원 전용</p>
      <h2 className="text-xl font-bold text-brand">
        {hasFullText ? "이 기사의 전문은 태안 인사이트 회원에게 제공됩니다" : "회원이 되시면 더 많은 기능을 이용하실 수 있어요"}
      </h2>
      <p className="text-sm text-foreground-muted">
        로그인하시면 전문과 AI 요약·관련 기사까지 한곳에서 보실 수 있어요.
      </p>
      <div className="flex justify-center gap-3 pt-1">
        <button type="button" onClick={onUnlock} className="btn-accent">
          로그인하고 전문 보기
        </button>
        <Link href="/me/onboarding" className="btn-ghost">
          회원가입
        </Link>
      </div>
    </div>
  );
}

function DemoMemberToggle({ member, onChange }: { member: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="no-print fixed bottom-4 right-4 z-50 rounded-lg bg-brand p-2 text-xs text-background shadow-lg">
      <p className="px-1 pb-1 text-background/70">데모: 회원 상태</p>
      <div className="flex gap-1">
        {[
          { v: false, label: "비회원" },
          { v: true, label: "회원" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={member === o.v}
            className={`rounded px-2 py-1 ${member === o.v ? "bg-accent text-background" : "bg-background/10 text-background/80"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 전자북 원본 지면 — 토글로 열 때만 로드, 클릭하면 전용 뷰어(확대·이동)로 열람
function OriginalPage({ src, label }: { src: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [viewer, setViewer] = useState(false);
  const fullSrc = src.replace(/\.jpg(\?|$)/, "full.jpg$1"); // page_03.jpg → page_03full.jpg
  return (
    <section className="rounded-lg border border-brand/15 bg-brand/[0.03]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-brand"
        aria-expanded={open}
      >
        <span>원본 지면 보기 <span className="ml-1 font-normal text-foreground-muted">({label})</span></span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-foreground-muted">
              주간태안신문 원본 지면 스캔 — ＋− 버튼으로 확대하고 드래그로 이동하세요.
            </p>
            <button
              onClick={() => setViewer(true)}
              className="shrink-0 rounded border border-brand/30 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand hover:text-background"
            >
              <Icon name="search" /> 전체화면
            </button>
          </div>
          <ZoomPanImage src={src} fullSrc={fullSrc} maxHeightClass="max-h-[40rem]" />
        </div>
      )}
      {viewer && <PageViewer src={fullSrc} label={label} onClose={() => setViewer(false)} />}
    </section>
  );
}
