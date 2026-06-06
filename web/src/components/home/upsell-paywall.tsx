"use client";

// 페이월 — 블러 처리된 미리보기 위에 가격·혜택·구독 CTA를 오버레이.
// 별도 과금 부가상품(초개인화 홈) 업셀 지점.

import { useState } from "react";
import type { AddonProduct } from "@/lib/types";

export function UpsellPaywall({
  product,
  children,
  onSubscribe,
}: {
  product: AddonProduct;
  children: React.ReactNode; // 블러 처리할 미리보기
  onSubscribe: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  async function handle() {
    setBusy(true);
    try {
      await onSubscribe();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      {/* 블러 미리보기 */}
      <div className="blur-sm opacity-60 max-h-[420px] overflow-hidden" aria-hidden="true">
        {children}
      </div>

      {/* 오버레이 */}
      <div className="absolute inset-0 flex items-start justify-center pt-10 bg-gradient-to-b from-background/20 to-background">
        <div className="w-full max-w-md rounded-2xl border border-accent/40 bg-background shadow-lift p-7 space-y-5 text-center">
          <p className="eyebrow justify-center">🔒 별도 구독 상품</p>
          <div>
            <h2 className="text-2xl font-bold text-brand">{product.name}</h2>
            <p className="text-sm text-foreground-muted mt-1.5">{product.description}</p>
          </div>

          <p className="font-display text-5xl text-brand">
            ₩{product.priceKrw.toLocaleString()}
            <span className="font-sans text-base font-medium text-foreground-muted"> / 월</span>
          </p>

          <ul className="text-sm text-left space-y-2">
            {product.benefits.map((b) => (
              <li key={b} className="flex gap-2.5 text-foreground">
                <span className="mt-0.5 text-accent" aria-hidden="true">
                  ✓
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <button type="button" onClick={handle} disabled={busy} className="btn-accent w-full disabled:opacity-60">
            {busy ? "처리 중…" : "초개인화 홈 구독하기"}
          </button>
          <p className="text-xs text-foreground-muted">
            기존 구독과 별도로 청구됩니다. 언제든 해지할 수 있어요.
          </p>
        </div>
      </div>
    </div>
  );
}
