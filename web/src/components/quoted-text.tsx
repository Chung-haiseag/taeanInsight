"use client";

// 인용부호("…") 구간을 강조색으로 — 발언·인용이 눈에 띄게.
//   2026-11-09: 기사 화면 안에 있던 것을 꺼냈다. 회차 화면의 읽기 패널이 같은 기사를
//   같은 모습으로 보여 줘야 한다(가르는 규칙은 lib/article-body.ts, 끊는 규칙은 lib/quote-highlight.ts).

import { segmentQuotes } from "@/lib/quote-highlight";

export function QuotedText({ text }: { text: string }) {
  return (
    <>
      {segmentQuotes(text).map((s, i) =>
        s.quote
          ? <span key={i} className="font-semibold text-ti-petrol-ink">{s.t}</span>
          : <span key={i}>{s.t}</span>,
      )}
    </>
  );
}
