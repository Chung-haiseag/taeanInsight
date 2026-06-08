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
  const [related, setRelated] = useState<ArchiveHit[]>([]);

  useEffect(() => {
    getRelatedArchive(Number(params.id)).then((r) => setRelated(r.items ?? [])).catch(() => {});
    setMember(getDemoHomeState() === "entitled");
    (async () => {
      try {
        // 1) D1 아카이브(전문) 우선
        const a = await getArchiveArticle(Number(params.id));
        setArticle({
          title: a.title,
          publishedAt: a.published_at,
          author: a.author,
          categoryLabel: ARCHIVE_CATEGORY_LABELS[a.category] ?? a.category,
          excerpt: a.excerpt ?? "",
          body: a.body,
          images: Array.isArray(a.images) ? a.images : [],
          url: a.url,
          source: "archive",
          hasFullText: !!(a.body && a.body.length > 0),
        });
      } catch {
        // 2) 아카이브에 없으면 RSS 발췌
        try {
          const n = await getNewsItem(params.id);
          setArticle({
            title: n.title,
            publishedAt: n.publishedAt,
            author: n.author,
            categoryLabel: n.categoryLabel,
            excerpt: n.excerpt,
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
    <article className="mx-auto max-w-prose space-y-6">
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

      {/* 리드(발췌) — 누구나 */}
      <p className="text-lg leading-relaxed text-foreground">{article.excerpt}</p>

      {member ? (
        <FullBody article={article} />
      ) : (
        <MemberGate
          hasFullText={article.hasFullText}
          onUnlock={() => { setDemoHomeState("entitled"); setMember(true); }}
        />
      )}

      {related.length > 0 && <RelatedArticles items={related} />}

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

function RelatedArticles({ items }: { items: ArchiveHit[] }) {
  return (
    <section className="border-t border-brand/10 pt-6 space-y-3">
      <p className="eyebrow">📚 이 주제 과거 기사</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.idxno}>
            <Link
              href={`/news/${it.idxno}`}
              className="flex gap-3 rounded-lg border border-brand/12 p-3 hover:border-brand/30 hover:bg-brand/[0.02]"
            >
              {it.lead_image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.lead_image} alt="" className="h-12 w-16 shrink-0 rounded object-cover bg-brand/5" loading="lazy" />
              )}
              <div className="min-w-0">
                <p className="text-xs text-foreground-muted">{(it.published_at ?? "").slice(0, 10)}</p>
                <p className="text-sm font-semibold text-brand line-clamp-2">{it.title}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FullBody({ article }: { article: Reader }) {
  return (
    <div className="space-y-5">
      {article.hasFullText ? (
        <div className="space-y-4 text-foreground leading-relaxed whitespace-pre-line">{article.body}</div>
      ) : (
        <>
          <div className="space-y-4 text-foreground leading-relaxed">
            <p>{article.excerpt}</p>
          </div>
          <div className="rounded-lg border border-brand/15 bg-brand/[0.03] p-4 text-sm text-foreground-muted">
            📚 전체 본문은 아카이브에 적재되면 이 자리에 표시됩니다. 지금은 발췌만 제공됩니다.
          </div>
        </>
      )}

      {/* 본문 사진 */}
      {article.images.length > 0 && (
        <div className="space-y-3">
          {article.images.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="w-full rounded-lg bg-brand/5" loading="lazy" />
          ))}
        </div>
      )}

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
