"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ZoomPanImage } from "@/components/zoom-pan-image";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

interface Article { idxno: number; title: string; excerpt?: string }

/**
 * 지면 넘겨보기 — 면을 고르면 스캔과 그 면의 기사 목록이 함께 바뀐다.
 *   신문을 손으로 넘기듯 읽히도록, 면 번호를 늘 위에 둔다.
 */
export function PaperViewer({ year, date, pages }: { year: number; date: string; pages: number[] }) {
  const [no, setNo] = useState(pages[0] ?? 1);
  const [arts, setArts] = useState<Article[] | null>(null);
  const ymd = date.replace(/-/g, "");
  const src = `${API_BASE}/api/archive/photo/ebook/${ymd}/page_${String(no).padStart(2, "0")}.jpg`;
  const fullSrc = src.replace(/\.jpg$/, "full.jpg");

  useEffect(() => {
    let alive = true;
    setArts(null);
    fetch(`${API_BASE}/api/archive/papers/${year}/${date}/${no}`)
      .then((r) => (r.ok ? r.json() : { articles: [] }))
      .then((d) => { if (alive) setArts((d as { articles?: Article[] }).articles ?? []); })
      .catch(() => { if (alive) setArts([]); });
    return () => { alive = false; };
  }, [year, date, no]);

  return (
    <div className="space-y-4">
      {/* 면 고르기 — 신문을 넘기는 자리다. 늘 위에 둔다. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setNo(p)}
            aria-current={p === no}
            className={`min-w-[2.5rem] rounded px-2.5 py-1.5 text-sm font-semibold ${
              p === no ? "bg-brand text-background" : "border border-brand/25 text-brand hover:bg-brand/5"}`}
          >
            {p}면
          </button>
        ))}
      </div>

      <ZoomPanImage src={src} fullSrc={fullSrc} maxHeightClass="max-h-[46rem]" />
      <p className="text-xs text-foreground-muted">＋− 버튼으로 확대하고 드래그로 이동하세요.</p>

      <section>
        <h2 className="mb-2 text-base font-bold text-brand">{no}면에 실린 기사</h2>
        {arts === null && <p className="text-sm text-foreground-muted">불러오는 중…</p>}
        {arts?.length === 0 && <p className="text-sm text-foreground-muted">이 면에서 뽑아낸 기사가 없습니다.</p>}
        <ul className="space-y-1.5">
          {arts?.map((a) => (
            <li key={a.idxno}>
              <Link href={`/news/${a.idxno}`} className="text-[15px] text-brand hover:underline">
                · {a.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
