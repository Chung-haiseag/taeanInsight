// 구조화된 답변 렌더 — parseAnswer 블록(문단·소제목·불릿·번호목록)을 가독성 좋게 표시. 인라인 **굵게** 지원.

import { Fragment } from "react";
import { parseAnswer } from "@/lib/answer-format";

// **굵게** 인라인 렌더
function inline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((p, i) =>
    /^\*\*[^*\n]+\*\*$/.test(p)
      ? <strong key={i} className="font-semibold text-brand">{p.slice(2, -2)}</strong>
      : <Fragment key={i}>{p}</Fragment>,
  );
}

export function AnswerView({ text }: { text: string }) {
  const blocks = parseAnswer(text);
  if (!blocks.length) {
    return <p className="text-foreground-muted">(빈 응답)</p>;
  }
  return (
    <div className="space-y-3 text-base leading-relaxed text-foreground">
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          return <h3 key={i} className="mt-1 text-lg font-bold text-brand">{inline(b.text)}</h3>;
        }
        if (b.type === "bullets") {
          return (
            <ul key={i} className="space-y-1.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span className="min-w-0">{inline(it)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "list") {
          return (
            <ol key={i} className="space-y-2">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent tabular-nums">
                    {j + 1}
                  </span>
                  <span className="min-w-0">
                    {it.label && <span className="font-semibold text-brand">{it.label}</span>}
                    {it.label ? " — " : ""}
                    {inline(it.body)}
                  </span>
                </li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{inline(b.text)}</p>;
      })}
    </div>
  );
}
