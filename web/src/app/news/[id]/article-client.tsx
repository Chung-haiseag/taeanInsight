"use client";

// 자체 기사 리더 — 태안신문으로 나가지 않고 우리 사이트에서 기사를 보여준다.
// 전문은 D1 아카이브에서(우리 쪽 회원 게이트 뒤), 없으면 RSS 발췌로 폴백.

import { useEffect, useState } from "react";
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
import { PageViewer } from "@/components/page-viewer";
import { ReadingTracker } from "@/components/reading-tracker";
import { NewsAudio } from "@/components/news-audio";

interface Reader {
  title: string;
  publishedAt: string;
  author?: string;
  category?: string;
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
// 1990~1994 옛 신문(세로쓰기·저품질 인쇄)은 충실도 수치와 무관하게 항상 안내 표시.
// (특히 1990은 Gemini 멀티모달 전사라 원문 대조 가드가 없어 신뢰성 고지 필요)
const OLD_PRINT_UNTIL = 1994;

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

export default function ArticleClient() {
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
          category: a.category,
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
    <article className="mx-auto max-w-7xl space-y-6">
      {/* 읽기 행동 추적(초개인화) — 렌더 영향 없음 */}
      <ReadingTracker idxno={Number(params.id)} category={article.category} />
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
        <div className="no-print pt-1">
          <NewsAudio idxno={Number(params.id)} />
        </div>
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
            // 자연 크기 표시(작으면 작게), 단 본문 폭·높이 상한만 둠 — 작은 사진이 흐릿하게 늘어나지 않게
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="mx-auto block h-auto rounded-lg bg-brand/5" style={{ maxWidth: "min(100%, 640px)", maxHeight: "34rem" }} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
