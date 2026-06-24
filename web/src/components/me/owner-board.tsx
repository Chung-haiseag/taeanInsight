"use client";

// 내 페이지용 사장님 보드 — 가게 정보가 있으면 owner-brief(모텔 운영 보드·실행 제안)를 노출.
// 사장님 홈(OwnerHome)과 같은 데이터를 /me에서도 바로 보이게.

import { useEffect, useState } from "react";

import { fetchOwnerBrief, type OwnerBrief } from "@/lib/api/owner";
import { LodgingBoardCard } from "@/components/home/owner-home";

export function MeOwnerBoard() {
  const [brief, setBrief] = useState<OwnerBrief | null>(null);
  useEffect(() => { fetchOwnerBrief().then(setBrief).catch(() => {}); }, []);
  if (!brief?.hasShop) return null;

  return (
    <div className="space-y-5">
      {brief.lodging && <LodgingBoardCard board={brief.lodging} nearby={brief.market.nearbyLodging} />}

      {brief.actions.length > 0 && (
        <section className="rounded-2xl border border-brand/10 bg-background p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-bold text-brand">💡 오늘의 실행 제안</h2>
          <div className="mt-3 space-y-2">
            {brief.actions.map((a, i) => (
              <article key={i} className="flex gap-3 rounded-xl border border-accent/20 bg-accent-subtle/15 p-3">
                <span className="text-xl" aria-hidden>{a.icon}</span>
                <div>
                  <p className="font-semibold text-brand">
                    {a.text}
                    {a.tag && <span className={`ml-2 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${a.tag === "안전" ? "bg-red-100 text-red-700" : a.tag === "매출" ? "bg-accent/20 text-accent" : "bg-brand/10 text-brand"}`}>{a.tag}</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground-muted">{a.why}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
