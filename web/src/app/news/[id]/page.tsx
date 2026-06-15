"use client";

// 자체 기사 리더 — 태안신문으로 나가지 않고 우리 사이트에서 기사를 보여준다.
// 전문은 D1 아카이브에서(우리 쪽 회원 게이트 뒤), 없으면 RSS 발췌로 폴백.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { getNewsItem } from "@/lib/api/news";
import {
  getArchiveArticle,
  getRelatedArchive,
  ARCHIVE_CATEGORY_LABELS,
  type ArchiveHit,
} from "@/lib/api/archive";
import { getDemoHomeState, setDemoHomeState, isMockMode } from "@/lib/mock/addons";
import { decodeEntities } from "@/lib/html";
import { ZoomPanImage } from "@/components/zoom-pan-image";

interface Reader {
  title: string;
  publishedAt: string;
  author?: string;
  categoryLabel: string;
  excerpt: string;
  body?: string; // 전문 (D1)
  images: string[]; // 본문 사진
  url?: string;
  source: "archive" | "rss";
  hasFullText: boolean;
  pageImage?: string | null; // 전자북(과거지면): 원본 지면 스캔
  pageLabel?: string | null; // 예: "1990.5.14 · 지면 03면"
  faithfulness?: number | null; // 전자북 OCR 충실도
}

// 이 값 미만이면 "OCR 불완전 — 원본 지면 확인" 안내를 본문 하단에 표시
// (검수 '경고' 임계값과 동일 — 약 14.6%, 7건 중 1건)
const LOW_FAITH = 0.75;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.insight.taeannews.co.kr";

// 전자북 기사(90000001~)면 원본 지면 스캔 URL 유도 (R2: ebook/<ymd>/page_<NN>.jpg)
function ebookPageImage(idxno: number, section?: string | null, publishedAt?: string | null) {
  if (!(idxno >= 90000001 && idxno <= 90099999)) return { pageImage: null, pageLabel: null };
  const m = /지면\s*(\d{2})면/.exec(section ?? "");
  const ymd = (publishedAt ?? "").slice(0, 10).replace(/-/g, "");
  if (!m || ymd.length !== 8) return { pageImage: null, pageLabel: null };
  return {
    pageImage: `${API_BASE}/api/archive/photo/ebook/${ymd}/page_${m[1]}.jpg`,
    pageLabel: `${ymd.slice(0, 4)}.${Number(ymd.slice(4, 6))}.${Number(ymd.slice(6, 8))} · 지면 ${m[1]}면`,
  };
}

function formatDate(s: string): string {
  const m = (s || "").match(/(\d{4})[-.](\d{2})[-.](\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])} ${m[4]}` : s;
}

export default function NewsReaderPage() {
  const params = useParams<{ id: string }>();
  const [article, setArticle] = useState<Reader | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState(false);

  useEffect(() => {
    setMember(getDemoHomeState() === "entitled");
    (async () => {
      try {
        // 1) D1 아카이브(전문) 우선
        const a = await getArchiveArticle(Number(params.id));
        setArticle({
          title: decodeEntities(a.title),
          publishedAt: a.published_at,
          author: a.author,
          categoryLabel: ARCHIVE_CATEGORY_LABELS[a.category] ?? a.category,
          excerpt: decodeEntities(a.excerpt ?? ""),
          body: decodeEntities(a.body),
          images: Array.isArray(a.images) ? a.images : [],
          url: a.url,
          source: "archive",
          hasFullText: !!(a.body && a.body.length > 0),
          faithfulness: typeof a.faithfulness === "number" ? a.faithfulness : null,
          ...ebookPageImage(Number(params.id), a.section, a.published_at),
        });
      } catch {
        // 2) 아카이브에 없으면 RSS 발췌
        try {
          const n = await getNewsItem(params.id);
          setArticle({
            title: decodeEntities(n.title),
            publishedAt: n.publishedAt,
            author: n.author,
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
  }, [params.id]);

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
    <article className="mx-auto max-w-6xl space-y-6">
      <div className="flex gap-4 text-sm text-foreground-muted">
        <Link href="/news" className="hover:text-brand">← 태안뉴스</Link>
        <Link href="/archive" className="hover:text-brand">아카이브 검색</Link>
      </div>

      <header className="space-y-3 border-b border-brand/10 pb-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">
            {article.categoryLabel}
          </span>
          <span className="text-foreground-muted">{formatDate(article.publishedAt)}</span>
          {article.author && <span className="text-foreground-muted">· {article.author}</span>}
        </div>
        <h1 className="text-display-sm font-bold text-brand">{article.title}</h1>
      </header>

      {member && article.hasFullText ? (
        <FullBody article={article} />
      ) : (
        <>
          {/* 리드(발췌) */}
          <p className="text-lg leading-relaxed text-foreground">{article.excerpt}</p>
          {member ? (
            <div className="rounded-lg border border-brand/15 bg-brand/[0.03] p-4 text-sm text-foreground-muted">
              📚 전체 본문은 아카이브에 적재되면 이 자리에 표시됩니다. 지금은 발췌만 제공됩니다.
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
    <section className="border-t border-brand/10 pt-6 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">📚 관련 뉴스</p>
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

function FullBody({ article }: { article: Reader }) {
  const paras = splitParagraphs(article.body || "");
  return (
    <div className="space-y-5">
      <div className="space-y-5 text-[1.05rem] leading-[1.9] text-foreground">
        {paras.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {/* 본문 사진 */}
      {article.images.length > 0 && (
        <div className="space-y-3">
          {article.images.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="w-full rounded-lg bg-brand/5" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ))}
        </div>
      )}

      {/* 저충실도 전자북: OCR 불완전 안내 (본문 하단, 진한 색) */}
      {article.pageImage && typeof article.faithfulness === "number" && article.faithfulness < LOW_FAITH && (
        <p className="rounded-md border-l-4 border-amber-600 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-900">
          ⚠ 완벽하게 OCR이 되지 않아, 기사 내용을 확인하려면 아래 <span className="underline">원본 지면</span>을 확인하세요.
        </p>
      )}

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
      <p className="eyebrow justify-center">🔒 회원 전용</p>
      <h2 className="text-xl font-bold text-brand">
        {hasFullText ? "이 기사의 전문은 태안 인텔리전스 회원에게 제공됩니다" : "회원이 되시면 더 많은 기능을 이용하실 수 있어요"}
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
    <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-brand p-2 text-xs text-background shadow-lg">
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
        <span>📰 원본 지면 보기 <span className="ml-1 font-normal text-foreground-muted">({label})</span></span>
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
              🔍 전체화면
            </button>
          </div>
          <ZoomPanImage src={src} fullSrc={fullSrc} maxHeightClass="max-h-[40rem]" />
        </div>
      )}
      {viewer && <PageViewer src={fullSrc} label={label} onClose={() => setViewer(false)} />}
    </section>
  );
}

// 지면 확대 뷰어 — 풀스크린 라이트박스: +/−·핀치(ctrl+휠) 줌, 드래그/스크롤 이동, 폭맞춤↔200%, ESC 닫기
function PageViewer({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1); // 1 = 화면 폭맞춤, 최대 4배
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ on: false, x: 0, y: 0, sl: 0, st: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z + 0.25));
      if (e.key === "-") setZoom((z) => Math.max(1, z - 0.25));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden"; // 배경 스크롤 잠금
    // 트랙패드 핀치(=ctrl+휠) 줌 — React 합성 wheel은 passive라 네이티브로 등록
    const el = scrollRef.current;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // 일반 휠은 스크롤(이동), 핀치/ctrl+휠만 줌
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(1, z - Math.sign(e.deltaY) * 0.2)));
    };
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      el?.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={`원본 지면 뷰어 (${label})`}>
      {/* 컨트롤 바 */}
      <div className="flex items-center justify-between gap-3 bg-black/60 px-4 py-2.5 text-white">
        <span className="truncate text-sm">📰 주간태안신문 · {label}</span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setZoom((z) => Math.max(1, z - 0.25))} className="rounded bg-white/15 px-3 py-1.5 text-sm font-bold hover:bg-white/30" aria-label="축소">−</button>
          <span className="w-14 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="rounded bg-white/15 px-3 py-1.5 text-sm font-bold hover:bg-white/30" aria-label="확대">＋</button>
          <button onClick={() => setZoom((z) => (z === 1 ? 2 : 1))} className="ml-1 rounded bg-white/15 px-2.5 py-1.5 text-xs hover:bg-white/30">
            {zoom === 1 ? "200%" : "폭맞춤"}
          </button>
          <button onClick={onClose} className="ml-2 rounded bg-white/15 px-3 py-1.5 text-sm font-bold hover:bg-red-600" aria-label="닫기">✕</button>
        </div>
      </div>
      {/* 지면 영역: 줌=이미지 폭 배율, 드래그/스크롤로 이동, 휠로 줌 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto overscroll-contain cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          const el = scrollRef.current; if (!el) return;
          drag.current = { on: true, x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const el = scrollRef.current, d = drag.current; if (!d.on || !el) return;
          el.scrollLeft = d.sl - (e.clientX - d.x); el.scrollTop = d.st - (e.clientY - d.y);
        }}
        onPointerUp={() => { drag.current.on = false; }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div style={{ width: `${zoom * 100}%` }} className="mx-auto min-w-full px-0 py-2 transition-[width] duration-150">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`원본 지면 (${label})`} className="w-full select-none" draggable={false} />
        </div>
      </div>
      <p className="bg-black/60 px-4 py-1.5 text-center text-[11px] text-white/70">
        휠/＋− 확대 · 드래그 이동 · 더블클릭 대신 200% 버튼 · ESC 닫기
      </p>
    </div>
  );
}
